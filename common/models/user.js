'use strict';
var assert = require('assert');
var async = require('async');
var passport = require('passport');
var randomstring = require('randomstring');
var logger = require('winston');
var createError = require('../utils/http-errors');

var utils = require('../utils');

var GearClient = require('../utils/gearman-client');
var gearClient = GearClient.factory({ servers:  process.env.G_SERVERS ? JSON.parse(process.env.G_SERVERS) : null });

var config = require('../../server/api.json');

module.exports = function(User) {

  // disable default remote methods
  User.disableRemoteMethod('__get__followers', false);
  User.disableRemoteMethod('__create__followers', false);
  User.disableRemoteMethod('__delete__followers', false);
  User.disableRemoteMethod('__get__following', false);
  User.disableRemoteMethod('__create__following', false);
  User.disableRemoteMethod('__delete__following', false);
  User.disableRemoteMethod('__get__media', false);
  
  function descending(a,b) {
    if (a.sid > b.sid)
      return -1;
    else if (a.sid < b.sid)
      return 1;
    else
      return 0;
  }

  User.authFacebookToken = function(req, res, callback) {
    passport.authenticate('facebook-token', function(err, user, info) {
      if (err) {
        logger.error(err);
        return callback(new createError.InternalServerError());
      }
      if (!user) {
        return callback(new createError.Unauthorized());
      }
      if (info && info.accessToken) {
        if (req.query.include === 'user') {
          var UserIdentity = User.app.models.userIdentity;
          UserIdentity.find({
            where: { userId: user.sid },
            fields: ['provider', 'profile']
          }, function(err, identity) {
            if (err) {
              logger.error(err);
              return callback(new createError.InternalServerError());
            }
            if (identity.length === 0) {
              return callback(new createError.Unauthorized());
            }
            return callback(null, { token: info.accessToken, user: user, identity: identity[0] });
          });
        } else {
          return callback(null, info.accessToken);
        }
      }
    })(req, res);
  };
  User.remoteMethod('authFacebookToken', {
    accepts: [
      { arg: 'req', type: 'object', 'http': { source: 'req' } },
      { arg: 'res', type: 'object', 'http': { source: 'res' } }
    ],
    returns: [ { arg: 'auth', type: 'object' } ],
    http: { path: '/auth/facebook/token', verb: 'get' }
  });

  User.beforeRemote('prototype.updateAttributes', function(ctx, unused, next){
    for (var prop in ctx.req.body){
      if (prop !== 'autobiography' && prop !== 'gaId'){
        return next(new createError.NotFound('the attribute \'' + prop + '\' is prohibited to update'));
      }
    }
    next();
  });


  User.beforeRemote('login', function(ctx, unused, next){
    User.find({where:{email: ctx.req.body.email}}, function(err, user) {
      if (err) { 
        logger.error(err);
        return next(new createError.InternalServerError());
      }
      if (!user[0]) { 
        return next(new createError.NotFound({code: 'EMAIL_NOT_FOUND'}));
      }
      next();
    });
  });


  User.beforeRemote('create', function(ctx, unused, next){
    // check the username is existed
    User.find({where: {username: ctx.req.body.username}}, function(err, user) {
      if (err) { 
        logger.error(err);
        return next(new createError.InternalServerError());
      }
      if (user[0]) { 
        return next(new createError.UnprocessableEntity({code: 'USERNAME_REGISTERED'}));
      }
      // check the email is existed
      User.find({where:{email: ctx.req.body.email}}, function(err, user) {
        if (err) { 
          logger.error(err);
          return next(new createError.InternalServerError());
        }
        if (user[0]) { 
          return next(new createError.UnprocessableEntity({code: 'EMAIL_REGISTERED'}));
        }
        next();
      });
    });
  });


  User.query = function(id, req, json, callback) {
    logger.debug('in query');
    var where = json.where || undefined;
    var limit = config.constants.query.PAGE_SIZE; // default limit

    if (json.limit) {
      if (typeof json.limit === 'string') {
        json.limit = parseInt(json.limit, 10);
      }
      if (json.limit > 0) {
        limit = json.limit;
      }
    }

    var query = {
      where: {
        followerId: id
      },
      include: {
        relation: 'following',
        scope: {
          include: {
            relation: 'media',
            scope: {
              where: {
                status: 'completed'
              },
              order: 'sid DESC',
              limit: limit + 1,
              include: [
                {
                  relation: 'owner',
                  scope: {
                    fields: [ 'username', 'profilePhotoUrl' ],
                    include: {
                      relation: 'identities',
                      scope: {
                        fields: [ 'provider', 'profile' ]
                      }
                    }
                  }
                },
                {
                  relation: '_likes_',
                  scope: {
                    fields: [ 'userId' ]
                  }
                },
                {
                  relation: 'location',
                  scope: {
                    fields: [ 'name', 'geo', 'city', 'street', 'zip' ]
                  }
                }
              ]
            }
          }
        }
      }
    };
    // TODO: should have a more comprehensive parser for parsing the where query
    if (where && (typeof where === 'object')) {
      try {
        if ((where.sid.hasOwnProperty('lt') && (typeof where.sid.lt === 'string')) ||
            (where.sid.hasOwnProperty('gt') && (typeof where.sid.gt === 'string')))
        {
          // update the where clause for the 'media' inclusion of the query
          query.include.scope.include.scope.where.sid = where.sid;
        } else {
          return callback(new createError.BadRequest('invalid query operator'));
        }
      } catch (err) {
        logger.error(err);
        return callback(new createError.BadRequest());
      }
    }
    var Follow = User.app.models.follow;
    Follow.find(query, function(err, followingList) {
      if (err) {
        logger.error(err);
        return callback(new createError.InternalServerError());
      }
      var output = {
        page: {
          hasNextPage: false,
          count: 0,
          start: null,
          end: null
        },
        feed: []
      };
      if (!followingList) {
        return callback(null, output);
      }
      followingList.forEach(function(item) {
        var obj = item.toJSON();
        if (obj.following) {
          output.feed = output.feed.concat(obj.following.media);
        }
      });
      output.feed.sort(descending);
      if (output.feed.length > limit) {
        output.page.hasNextPage = true;
        output.page.count = limit;
        output.page.start = output.feed[0].sid;
        output.page.end = output.feed[limit - 1].sid;
        output.feed = output.feed.slice(0, limit);
      } else if (0 < output.feed.length && output.feed.length <= limit) {
        output.page.hasNextPage = false;
        output.page.count = output.feed.length;
        output.page.start = output.feed[0].sid;
        output.page.end = output.feed[output.feed.length - 1].sid;
        output.feed = output.feed.slice(0, output.feed.length);
      }
      for (var i = 0; i < output.feed.length; i++) {
        output.feed[i].likes = utils.formatLikeList(output.feed[i]['_likes_'], req.accessToken.userId);
        delete output.feed[i]['_likes_'];
      }
      callback(null, output);
    });
  };
  User.remoteMethod('query', {
    accepts: [
      { arg: 'id', type: 'string', require: true },
      { arg: 'req', type: 'object', 'http': { source: 'req' } },
      { arg: 'json', type: 'object', 'http': { source: 'body' } }
    ],
    returns: [ { arg: 'result', type: 'object' } ],
    http: { path: '/:id/query', verb: 'post' }
  });

  var verifyFollowing = function(followerId, followeeId, done) {
    if (followerId === followeeId) {
      return done(new createError.BadRequest('self following is not allowed'));
    }
    async.parallel({
      verifyFollower: function(callback) {
        User.findById(followerId, function(err, user) {
          if (err) { return callback(err); }
          if (!user) { return callback(new createError.NotFound('the follower user is not found')); }
          callback(null);
        });
      },
      verifyFollowee: function(callback) {
        User.findById(followeeId, function(err, user) {
          if (err) { return callback(err); }
          if (!user) { return callback(new createError.NotFound('the followee user is not found')); }
          callback(null);
        });
      }
    }, function(err) {
      if (err) {
        if (err.status === 404) { return done(err); }
        logger.error(err);
        return done(new createError.InternalServerError());
      }
      done();
    });
  };

  User.follow = function(followerId, followeeId, callback) {
    verifyFollowing(followerId, followeeId, function(err) {
      if (err) { return callback(err); }
      var Follow = User.app.models.follow;
      // Check if it is a duplicate following
      // FIXME: We should use composite id here instead of checking for duplicate entry
      //        by ourselves, however, loopback's datasource juggler has an issue for
      //        using composite id, so this is a temporary workaround until the issue
      //        is resovled.
      //
      //        Tracking issues:
      //          https://github.com/strongloop/loopback-datasource-juggler/issues/121
      //          https://github.com/strongloop/loopback-datasource-juggler/issues/478
      var followObj = { followerId: followerId, followeeId: followeeId };
      Follow.findOrCreate({ where: followObj }, followObj, function(err) {
        if (err) {
          logger.error(err);
          return callback(new createError.InternalServerError());
        }
        callback(null, 'success');
      });
    });
  };
  User.remoteMethod('follow', {
    accepts: [
      { arg: 'followerId', type: 'string', require: true },
      { arg: 'followeeId', type: 'string', require: true }
    ],
    returns: [ { arg: 'status', type: 'string' } ],
    http: { path: '/:followerId/follow/:followeeId', verb: 'post' }
  });

  User.unfollow = function(followerId, followeeId, callback) {
    verifyFollowing(followerId, followeeId, function(err) {
      if (err) { return callback(err); }
      var Follow = User.app.models.follow;
      Follow.destroyAll({followerId: followerId, followeeId: followeeId}, function(err) {
        if (err) {
          logger.error(err);
          return callback(new createError.InternalServerError());
        }
        callback(null, 'success');
      });
    });
  };
  User.remoteMethod('unfollow', {
    accepts: [
      { arg: 'followerId', type: 'string', require: true },
      { arg: 'followeeId', type: 'string', require: true }
    ],
    returns: [ { arg: 'status', type: 'string' } ],
    http: { path: '/:followerId/unfollow/:followeeId', verb: 'post' }
  });

  User.listFollowers = function(id, req, callback) {
    var Follow = User.app.models.follow;
    Follow.find({
      where: { followeeId: id },
      fields: [ 'followerId', 'followAt' ],
      include: {
        relation: 'follower',
        scope: {
          fields: [ 'username', 'profilePhotoUrl' ],
          include: [
            {
              relation: 'followers',
              scope: {
                where: {
                  followerId: req.accessToken.userId
                }
              }
            },
            {
              relation: 'identities',
              scope: {
                fields: [ 'provider', 'profile' ]
              }
            }
          ]
        }
      }
    }, function(err, followers) {
      if (err) {
        logger.error(err);
        return callback(new createError.InternalServerError());
      }
      var output = [];
      if (!followers) {
        return callback(null, output);
      }
      followers.forEach(function(follower) {
        var followerObj = follower.toJSON();
        followerObj.isFollowing = false;
        if (followerObj.follower && followerObj.follower.followers) {
          if (followerObj.follower.followers.length !== 0) {
            followerObj.isFollowing = true;
          }
          delete followerObj.follower.followers;
        }
        output.push(followerObj);
      });
      callback(null, output);
    });
  };
  User.remoteMethod('listFollowers', {
    accepts: [
      { arg: 'id', type: 'string', require: true },
      { arg: 'req', type: 'object', 'http': { source: 'req' } }
    ],
    returns: [ { arg: 'result', type: 'string' } ],
    http: { path: '/:id/followers', verb: 'get' }
  });

  User.listFollowing = function(id, req, callback) {
    var Follow = User.app.models.follow;
    Follow.find({
      where: { followerId: id },
      fields: [ 'followeeId', 'followAt' ],
      include: {
        relation: 'following',
        scope: {
          fields: [ 'username', 'profilePhotoUrl' ],
          include: [
            {
              relation: 'followers',
              scope: {
                where: {
                  followerId: req.accessToken.userId
                }
              }
            },
            {
              relation: 'identities',
              scope: {
                fields: [ 'provider', 'profile' ]
              }
            }
          ]
        }
      }
    }, function(err, following) {
      if (err) {
        logger.error(err);
        return callback(new createError.InternalServerError());
      }
      var output = [];
      if (!following) {
        return callback(null, output);
      }
      following.forEach(function(item) {
        var followingObj = item.toJSON();
        followingObj.isFollowing = false;
        if (followingObj.following && followingObj.following.followers) {
          if (followingObj.following.followers.length !== 0) {
            followingObj.isFollowing = true;
          }
          delete followingObj.following.followers;
        }
        output.push(followingObj);
      });
      callback(null, output);
    });
  };
  User.remoteMethod('listFollowing', {
    accepts: [
      { arg: 'id', type: 'string', require: true },
      { arg: 'req', type: 'object', 'http': { source: 'req' } }
    ],
    returns: [ { arg: 'result', type: 'string' } ],
    http: { path: '/:id/following', verb: 'get' }
  });

  User.uploadProfilePhoto = function(id, json, callback) {
    if (!json.image) {
      return callback(new createError.BadRequest('image not found'));
    }
    User.findById(id, function(err, user) {
      if (err) {
        logger.error(err);
        return callback(new createError.InternalServerError());
      }
      if (!user) {
        return callback(new createError.NotFound('user not found'));
      }
      if (user.profilePhotoUrl) {
        gearClient.submitJob('replaceUserPhoto', {
          userId: id,
          oldUrl: user.profilePhotoUrl,
          image: json.image
        }, function(err, result) {
          if (err) { return callback(err); }
          User.updateAll({ sid: id }, {
            profilePhotoSrcUrl: result.srcUrl,
            profilePhotoUrl: result.downloadUrl
          }, function(err) {
            if (err) { return callback(err); }
            callback(null, 'success');
          });
        });
      } else {
        gearClient.submitJob('createUserPhoto', {
          userId: id,
          image: json.image
        }, function(err, result) {
          if (err) { return callback(err); }
          User.updateAll({ sid: id }, {
            profilePhotoSrcUrl: result.srcUrl,
            profilePhotoUrl: result.downloadUrl
          }, function(err) {
            if (err) { return callback(err); }
            callback(null, 'success');
          });
        });
      }
    });
  };
  User.remoteMethod('uploadProfilePhoto', {
    accepts: [
      { arg: 'id', type: 'string', require: true },
      { arg: 'json', type: 'object', 'http': { source: 'body' } }
    ],
    returns: [ { arg: 'status', type: 'string' } ],
    http: { path: '/:id/photo', verb: 'post' }
  });

  User.getProfile = function(id, req, callback) {
    User.findById(id, {
      fields: [ 'sid', 'username', 'profilePhotoUrl', 'autobiography', 'gaId'],
      include: [
        {
          relation: 'followers'
        },
        {
          relation: 'followings'
        },
        {
          relation: 'identities',
          scope: {
            fields: [ 'provider', 'profile' ]
          }
        },
        {
          relation: 'media',
          scope: {
            where: { status: 'completed' },
            fields: [ 'sid' ]
          }
        }
      ]
    }, function(err, user) {
      if (err) {
        logger.error(err);
        return callback(new createError.InternalServerError());
      }
      if (!user) {
        return callback(new createError.NotFound('user not found'));
      }
      var userObj = user.toJSON();
      var output = {
        sid: userObj.sid,
        username: userObj.username.split('.')[0] === 'facebook-token' ? userObj.identities[0].profile.displayName : userObj.username,
        profilePhotoUrl: userObj.profilePhotoUrl,
        autobiography: userObj.autobiography || null,
        gaId: userObj.gaId || null,
        media: userObj.media.length,
      };
      
      if (req.query.withFollow === 'true') {
        output.followers = userObj.followers.length;
        output.following = userObj.followings.length;  
        output.isFollowing = Boolean(userObj.followers.find(function(follower) {
          return follower.followerId === req.accessToken.userId;
        }));
      }
        
      callback(null, output);
    });
  };
  User.remoteMethod('getProfile', {
    accepts: [
      { arg: 'id', type: 'string', require: true },
      { arg: 'req', type: 'object', 'http': { source: 'req' } }
    ],
    returns: [ { arg: 'profile', type: 'string' } ],
    http: { path: '/:id/profile', verb: 'get' }
  });

  User.profileQuery = function(id, req, json, callback) {
    logger.debug('in profile query');
    var where = json.where || undefined;
    var limit = config.constants.query.PAGE_SIZE; // default limit
    if (json.limit) {
      if (typeof json.limit === 'string') {
        json.limit = parseInt(json.limit, 10);
      }
      if (json.limit > 0) {
        limit = json.limit;
      }
    }
    var query = {
      where: {
        ownerId: id,
        status: 'completed'
      },
      order: 'sid DESC',
      limit: limit + 1, // to see if we have next page
      include: [
        {
          relation: 'owner',
          scope: {
            fields: [ 'username', 'profilePhotoUrl' ],
            include: {
              relation: 'identities',
              scope: {
                fields: [ 'provider', 'profile' ]
              }
            }
          }
        },
        {
          relation: '_likes_',
          scope: {
            fields: [ 'userId' ]
          }
        },
        {
          relation: 'location',
          scope: {
            fields: [ 'name', 'geo', 'city', 'street', 'zip' ]
          }
        }
      ]
    };
    // TODO: should have a more comprehensive parser for parsing the where query
    if (where && (typeof where === 'object')) {
      try {
        if ((where.sid.hasOwnProperty('lt') && (typeof where.sid.lt === 'string')) ||
            (where.sid.hasOwnProperty('gt') && (typeof where.sid.gt === 'string')))
        {
          query.where.sid = where.sid;
        } else {
          return callback(new createError.BadRequest('invalid query operator'));
        }
      } catch (err) {
        logger.error(err);
        return callback(new createError.BadRequest());
      }
    }

    var Media = User.app.models.media;
    Media.find(query, function(err, media) {
      if (err) {
        logger.error(err);
        return callback(new createError.InternalServerError());
      }
      var output = {
        page: {
          hasNextPage: false,
          count: 0,
          start: null,
          end: null
        },
        feed: []
      };
      if (!media) {
        return callback(null, output);
      }
      media.sort(descending);
      if (media.length > limit) {
        output.page.hasNextPage = true;
        output.page.count = limit;
        output.page.start = media[0].sid;
        output.page.end = media[limit - 1].sid;
        output.feed = media.slice(0, limit);
      } else if (0 < media.length && media.length <= limit) {
        output.page.hasNextPage = false;
        output.page.count = media.length;
        output.page.start = media[0].sid;
        output.page.end = media[media.length - 1].sid;
        output.feed = media.slice(0, media.length);
      }
      for (var i = 0; i < output.feed.length; i++) {
        var mediaObj = output.feed[i].toJSON();
        if (req.query.withLike === 'true') {
          mediaObj.likes = utils.formatLikeList(mediaObj['_likes_'], req.accessToken.userId);
        }
        delete mediaObj['_likes_'];
        
        output.feed[i] = mediaObj;
      }
      callback(null, output);
    });
  };
  User.remoteMethod('profileQuery', {
    accepts: [
      { arg: 'id', type: 'string', require: true },
      { arg: 'req', type: 'object', 'http': { source: 'req' } },
      { arg: 'json', type: 'object', 'http': { source: 'body' } }
    ],
    returns: [ { arg: 'result', type: 'object' } ],
    http: { path: '/:id/profile/query', verb: 'post' }
  });

  User.changePassword = function(id, body, callback) {
    var oldPassword = body.oldPassword || null;
    var newPassword = body.newPassword || null;
    if (!oldPassword || !newPassword) {
      return callback(new createError.BadRequest('missing properties'));
    }
    User.findById(id, function(err, user) {
      if (err) {
        logger.error(err);
        return callback(new createError.InternalServerError());
      }
      if (!user) {
        return callback(new createError.NotFound('user not found'));
      }
      user.hasPassword(oldPassword, function(err, isMatch) {
        if (err) {
          logger.error(err);
          return callback(new createError.InternalServerError());
        }
        if (isMatch) {
          user.updateAttribute('password', newPassword, callback);
        } else {
          callback(new createError.Unauthorized({code: 'WRONG_OLD_PASSWD'}));
        }
      });
    });
  };
  User.remoteMethod('changePassword', {
    accepts: [
      { arg: 'id', type: 'string', require: true },
      { arg: 'body', type: 'object', 'http': { source: 'body' } }
    ],
    returns: [ { arg: 'result', type: 'string' } ],
    http: { path: '/:id/changePassword', verb: 'post' }
  });

  User.requestResetPassword = function(json, callback) {
    var email = json.email;
    if (!email) {
      return callback(new createError.BadRequest('missing properties: email'));
    }
    User.find({ where: { email: email } }, function(err, user) {
      if (err) {
        logger.error(err);
        return callback(new createError.InternalServerError());
      }
      if (!user || user.length === 0) {
        return callback(new createError.NotFound({code: 'EMAIL_NOT_FOUND'}));
      }
      User.resetPassword({ email: email }, function(err) {
        if (err) {
          logger.error(err);
          return callback(new createError.InternalServerError());
        }
        callback(null, 'success');
      });
    });
  };
  User.remoteMethod('requestResetPassword', {
    accepts: [
      { arg: 'json', type: 'object', 'http': { source: 'body' } }
    ],
    returns: [ { arg: 'result', type: 'string' } ],
    http: { path: '/requestResetPassword', verb: 'post' }
  });

  User.on('resetPasswordRequest', function(info) {
    if (!info.accessToken) { return logger.error('invalid reset password request: Access Token Not Found'); }
    User.findById(info.accessToken.userId, {
      include: {
        relation: 'identities',
        scope: {
          fields: [ 'profile' ]
        }
      }
    }, function(err, user) {
      if (err) { return logger.error(err); }
      if (!user) { return logger.error('user not found: '+info.accessToken.userId); }
      var userObj = user.toJSON();
      var endpoint = User.app.get('restApiRoot') + '/users/resetPassword';
      var querystring = '?access_token=' + info.accessToken.id + '&redirect_url=www.verpix.me';
      var url;
      if (process.env.NODE_ENV === 'production') {
        url = 'https://' + User.app.get('hostname') + endpoint + querystring;
      } else {
        url = 'http://' + User.app.get('host') + ':' + User.app.get('port') + endpoint + querystring;
      }
      var username = userObj.identities.length !== 0 ? userObj.identities[0].profile.displayName : userObj.username;
      var html = 'Dear ' + username + ',<br><br>' +
                 'We have received your request of resetting the password.<br>' +
                 'If you made the request, please click the following link to confirm: <br><br>' +
                 '<a href="' + url + '">' + url +'</a><br><br>' +
                 'If you do not recognize this activity, please contact our support: service@verpix.me<br><br>' +
                 'Cheers,<br>' +
                 '- The team at Verpix';
      User.app.models.Email.send({
        to: info.email,
        from: 'service@verpix.me',
        subject: 'Confirm password reset',
        html: html
      }, function(err) {
        if (err) { logger.error(err); }
      });
    });
  });

  User.handleResetPassword = function(req, res, callback) {
    var newPassword = randomstring.generate({
      length: 8,
      readable: true,
      charset: 'alphanumeric',
      capitalization: 'lowercase'
    });
    User.findById(req.accessToken.userId, {
      include: {
        relation: 'identities',
        scope: {
          fields: [ 'profile' ]
        }
      }
    }, function(err, user) {
      if (err) {
        logger.error(err);
        return callback(new createError.InternalServerError());
      }
      if (!user) {
        return callback(new createError.NotFound('user not found'));
      }
      var userObj = user.toJSON();
      user.updateAttribute('password', newPassword, function(err) {
        if (err) {
          logger.error(err);
          return callback(new createError.InternalServerError());
        }
        var username = userObj.identities.length !== 0 ? userObj.identities[0].profile.displayName : userObj.username;
        var html = 'Dear ' + username + ',<br><br>' +
                   'The password for your Verpix account was reseted. The following is your temporary password:<br><br>' +
                   'Password: ' + newPassword +'<br><br>' +
                   'Please use the temporary password to log in Verpix, and change the password in settings.<br><br>' +
                   'Cheers,<br>' +
                   '- The team at Verpix';
        User.app.models.Email.send({
          to: user.email,
          from: 'service@verpix.me',
          subject: 'Password reseted',
          html: html
        }, function(err) {
          if (err) {
            logger.error(err);
            return callback(new createError.InternalServerError());
          }
          if (req.query['redirect_url']) {
            res.redirect('https://'+req.query['redirect_url']);
          } else {
            res.send('success');
          }
          callback();
        });
      });
    });
  };
  User.remoteMethod('handleResetPassword', {
    accepts: [
      { arg: 'req', type: 'object', 'http': { source: 'req' } },
      { arg: 'res', type: 'object', 'http': { source: 'res' } }
    ],
    http: { path: '/resetPassword', verb: 'get' }
  });

  User.createFeedback = function(id, json, callback) {
    User.findById(id, function(err, user) {
      if (err) {
        logger.error(err);
        return callback(new createError.InternalServerError());
      }
      if (!user) { return callback(new createError.NotFound('no user with the id was found')); }
      if (!user.email) { return callback(new createError.InternalServerError('user email not found')); }
      if (json.message && typeof json.message === 'string' && json.message !== '') {
        var appVersion = json.appVersion || 'not provided';
        var deviceName = json.device.name || 'not provided';
        var deviceOS = json.device.os || 'not provided';
        var subject = '[Feedback] ' + json.message.slice(0, 50) + '...';
        var content = 'User ID: ' + user.sid + '\n' +
                      'Username: ' + user.username + '\n' +
                      'App Version: ' + appVersion + '\n' +
                      'Device Name: ' + deviceName + '\n' +
                      'Device OS: ' + deviceOS + '\n\n' +
                      'Message: ' + json.message;
        User.app.models.Email.send({
          to: 'service@verpix.me',
          from: user.email,
          subject: subject,
          text: content
        }, function(err) {
          if (err) {
            logger.error(err);
            return callback(new createError.InternalServerError());
          }
          callback(null, 'success');
        });
      } else {
        callback(null, 'success');
      }
    });
  };
  User.remoteMethod('createFeedback', {
    accepts: [
      { arg: 'id', type: 'string', require: true },
      { arg: 'json', type: 'object', 'http': { source: 'body' } }
    ],
    returns: [ { arg: 'result', type: 'string' } ],
    http: { path: '/:id/feedback', verb: 'post' }
  });
};
