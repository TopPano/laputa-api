'use strict';
var assert = require('assert');
var async = require('async');
var passport = require('passport');
var S3Uploader = require('../utils/S3Uploader');
var S3Remover = require('../utils/S3Remover');

module.exports = function(User) {

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
      if (err) { return callback(err); }
      if (!user) {
        var error = new Error('Authentication Error');
        error.status = 401;
        return callback(error);
      }
      if (info && info.accessToken) {
        if (req.query.include === 'user') {
          var UserIdentity = User.app.models.userIdentity;
          UserIdentity.find({
            where: { userId: user.sid },
            fields: ['provider', 'profile']
          }, function(err, identity) {
            if (err) { return callback(err); }
            if (identity.length === 0) {
              var error = new Error('Authentication Error');
              error.status = 401;
              return callback(error);
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

  User.query = function(id, req, json, callback) {
    var Post = User.app.models.post;
    var Follow = User.app.models.follow;
    var where = json.where || undefined;
    var PAGE_SIZE = 12;
    var limit = PAGE_SIZE; // default limit

    if (json.limit) {
      if (typeof json.limit === 'string') {
        json.limit = parseInt(json.limit, 10);
      }
      if (json.limit > 0) {
        limit = json.limit;
      }
    }
    // get the following user list
    Follow.find({where: {followerId: id}}, function(err, followings) {
      if (err) {
        console.error(err);
        return callback(err);
      }
      var result = [];
      var query = {
        where: {
          status: 'completed'
        },
        limit: limit + 1 // to see if we have next page
      };
      // TODO: should have a more comprehensive parser for parsing the where query
      if (where && (typeof where === 'object')) {
        try {
          if ((where.sid.hasOwnProperty('lt') && (typeof where.sid.lt === 'string')) ||
              (where.sid.hasOwnProperty('gt') && (typeof where.sid.gt === 'string')))
          {
            query.where.sid = where.sid;
          } else {
            var error = new Error('Invalid query operator');
            error.status = 400;
            return callback(error);
          }
        } catch (e) {
          var error = new Error('Bad request');
          error.status = 400;
          return callback(error);
        }
      }
      // get the posts for each of the following user
      async.each(followings, function(following, callback) {
        query.where.ownerId = following.followeeId;
        var postQuery = {
          where: query.where,
          order: 'sid DESC',
          limit: query.limit,
          include: {
            relation: 'location',
            scope: {
              fields: [ 'name', 'geo', 'city', 'street', 'zip' ]
            }
          }
        };
        Post.find(postQuery, function(err, posts) {
          if (err) { return callback(err); }
          result = result.concat(posts);
          callback();
        });
      }, function(err) {
        if (err) { return callback(err); }

        result.sort(descending);

        var output = { page: {}, feed: [] }, i;
        if (result.length > limit) {
          output.page.hasNextPage = true;
          output.page.count = limit;
          output.page.start = result[0].sid;
          output.page.end = result[limit - 1].sid;
          output.feed = result.slice(0, limit);
        } else if (0 < result.length && result.length <= limit) {
          output.page.hasNextPage = false;
          output.page.count = result.length;
          output.page.start = result[0].sid;
          output.page.end = result[result.length - 1].sid;
          output.feed = result.slice(0, result.length);
        } else {
          output.page.hasNextPage = false;
          output.page.count = 0;
          output.page.start = null;
          output.page.end = null;
        }
        var Like = Post.app.models.like;
        async.each(output.feed, function(post, callback) {
          async.parallel({
            likeCount: function(callback) {
              Like.find({where: {postId: post.sid}}, function(err, list) {
                if (err) { return callback(err); }
                callback(null, list.length);
              });
            },
            isLiked: function(callback) {
              if (!req.accessToken) {
                var error = new Error('Bad Request: missing access token');
                error.status = 400;
                return callback(error);
              }
              User.findById(req.accessToken.userId, function(err, profile) {
                if (err) { return callback(err); }
                if (!profile) { return callback(new Error('No user with this access token was found.')); }
                Like.find({where: {postId: post.sid, userId: req.accessToken.userId}}, function(err, list) {
                  if (err) { return callback(err); }
                  if (list.length !== 0) { callback(null, true); }
                  else { callback(null, false); }
                });
              });
            },
            ownerInfo: function(callback) {
              User.findById(post.ownerId, {
                fields: [ 'sid', 'username', 'profilePhotoUrl' ],
                include: {
                  relation: 'identities',
                  scope: {
                    fields: [ 'provider', 'profile' ]
                  }
                }
              }, function(err, user) {
                if (err) { return callback(err); }
                if (!user) {
                  var error = new Error('Internal Error');
                  error.status = 500;
                  return callback(error);
                }
                callback(null, user);
              });
            }
          }, function(err, results) {
            if (err) { return callback(err); }
            post.likes = {
              count: results.likeCount,
              isLiked: results.isLiked
            };
            post.ownerInfo = results.ownerInfo;
            callback();
          });
        }, function(err) {
          if (err) {
            console.error(err);
            return callback(new Error('Internal Error'));
          }
          callback(null, output);
        });
      });
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
      var error = new Error('Self following is not allowed');
      error.status = 400;
      return done(error);
    }
    async.parallel({
      verifyFollower: function(callback) {
        User.findById(followerId, function(err, user) {
          if (err) { return callback(err); }
          if (!user) { return callback(new Error('Invalid User ID: '+followerId)); }
          callback(null);
        });
      },
      verifyFollowee: function(callback) {
        User.findById(followeeId, function(err, user) {
          if (err) { return callback(err); }
          if (!user) { return callback(new Error('Invalid User ID: '+followeeId)); }
          callback(null);
        });
      }
    }, function(err) {
      if (err) { return done(err); }
      done();
    });
  };

  User.follow = function(followerId, followeeId, callback) {
    verifyFollowing(followerId, followeeId, function(err) {
      if (err) {
        if (err.message.indexOf('Invalid User') !== -1) {
          var error = new Error(err);
          error.status = 404;
          return callback(error);
        }
        return callback(err);
      }
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
        if (err) { return callback(err); }
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
      if (err) {
        if (err.message.indexOf('Invalid User') !== -1) {
          var error = new Error(err);
          error.status = 404;
          return callback(error);
        }
        return callback(err);
      }
      var Follow = User.app.models.follow;
      Follow.destroyAll({followerId: followerId, followeeId: followeeId}, function(err) {
        if (err) {
          console.error(err);
          return callback(err);
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

  // disable default remote methods
  User.disableRemoteMethod('__get__followers', false);
  User.disableRemoteMethod('__create__followers', false);
  User.disableRemoteMethod('__delete__followers', false);
  User.disableRemoteMethod('__get__following', false);
  User.disableRemoteMethod('__create__following', false);
  User.disableRemoteMethod('__delete__following', false);

  User.listFollowers = function(id, req, callback) {
    var Follow = User.app.models.follow;
    Follow.find({
      where: { followeeId: id },
      fields: [ 'followerId', 'followAt' ],
      include: {
        relation: 'follower',
        scope: {
          fields: [ 'username', 'profilePhotoUrl' ],
          include: {
            relation: 'identities',
            scope: {
              fields: [ 'provider', 'profile' ]
            }
          }
        }
      }
    }, function(err, followers) {
      if (err) { return callback(err); }
      async.each(followers, function(user, callback) {
        Follow.find({
          where: {
            followeeId: user.followerId,
            followerId: req.accessToken.userId
          }
        }, function(err, result) {
          if (err) { return callback(err); }
          if (result.length === 0) {
            user.isFriend = false;
          } else {
            user.isFriend = true;
          }
          callback();
        });
      }, function(err) {
        if (err) { return callback(err); }
        callback(null, followers);
      });
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
          include: {
            relation: 'identities',
            scope: {
              fields: [ 'provider', 'profile' ]
            }
          }
        }
      }
    }, function(err, following) {
      if (err) { return callback(err); }
      async.each(following, function(user, callback) {
        Follow.find({
          where: {
            followeeId: user.followeeId,
            followerId: req.accessToken.userId
          }
        }, function(err, result) {
          if (err) { return callback(err); }
          if (result.length === 0) {
            user.isFriend = false;
          } else {
            user.isFriend = true;
          }
          callback();
        });
      }, function(err) {
        if (err) { return callback(err); }
        callback(null, following);
      });
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
    var uploader = new S3Uploader();

    try {
      var image = json.image ? new Buffer(json.image, 'base64') : undefined;
      if (!image) {
        var error = new Error('No image found');
        error.status = 400;
        return callback(error);
      }
      User.findById(id, function(err, user) {
        if (err) { return callback(err); }
        if (!user) {
          var error = new Error('User Not Found');
          error.status = 404;
          return callback(error);
        }
        // TODO: ugly.......
        var photoIndex = 1;
        if (user.profilePhotoUrl) {
          photoIndex = (parseInt(user.profilePhotoUrl.split('_')[2].split('.')[0], 10) + 1) % 1024;
          var remover = new S3Remover();
          remover.on('success', function(data) {
            var imageFilename = id+'_profile_'+photoIndex+'.jpg';
            var fileKey = 'users/'+id+'/photo/'+imageFilename;
            uploader.on('success', function(data) {
              assert(data.hasOwnProperty('Location'), 'Unable to get location property from S3 response object');
              assert((data.hasOwnProperty('key') || data.hasOwnProperty('Key')), 'Unable to get key property from S3 response object');
              // update with the new profile photo url
              // TODO: use CDN url
              User.updateAll({sid: id}, {profilePhotoUrl: data.Location}, function(err) {
                if (err) { return callback(err); }
                callback(null, 'success');
              });
            });
            uploader.on('error', function(err) {
              callback(err);
            });
            uploader.send({
              File: image,
              Key: fileKey,
              options: {
                ACL: 'public-read'
              }
            });
          });
          remover.on('error', function(err) {
            callback(err);
          });
          remover.remove({
            Key: user.profilePhotoUrl.split('/').slice(3, 7).join('/')
          });
        } else {
          var imageFilename = id+'_profile_'+photoIndex+'.jpg';
          var fileKey = 'users/'+id+'/photo/'+imageFilename;
          uploader.on('success', function(data) {
            assert(data.hasOwnProperty('Location'), 'Unable to get location property from S3 response object');
            assert((data.hasOwnProperty('key') || data.hasOwnProperty('Key')), 'Unable to get key property from S3 response object');
            // update with the new profile photo url
            // TODO: use CDN url
            User.updateAll({sid: id}, {profilePhotoUrl: data.Location}, function(err) {
              if (err) { return callback(err); }
              callback(null, 'success');
            });
          });
          uploader.on('error', function(err) {
            callback(err);
          });
          uploader.send({
            File: image,
            Key: fileKey,
            options: {
              ACL: 'public-read'
            }
          });
        }
      });
    } catch (err) {
      console.error(err);
      var error = new Error('Internal Error');
      error.status = 500;
      callback(error);
    }
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
    var Follow = User.app.models.follow;
    var Post = User.app.models.post;
    var UserIdentity = User.app.models.userIdentity;
    async.parallel({
      basicProfile: function(callback) {
        User.findById(id, function(err, profile) {
          if (err) { return callback(err); }
          if (!profile) {
            var error = new Error('User Not Found');
            error.status = 404;
            return callback(error);
          }
          if (profile.username && profile.username.split('.')[0] === 'facebook-token') {
            UserIdentity.find({ where: {userId: profile.sid }}, function(err, userIdentity) {
              if (err) { return callback(err); }
              if (userIdentity.length === 0) {
                var error = new Error('User Identity Not Found');
                error.status = 404;
                return callback(error);
              }
              var username;
              if (!!userIdentity[0].profile.displayName) {
                username = userIdentity[0].profile.displayName;
              } else {
                username = userIdentity[0].profile.name.givenName + ' ' + userIdentity[0].profile.name.familyName;
              }
              callback(null, {
                username: username,
                profilePhotoUrl: profile.profilePhotoUrl,
                autobiography: profile.autobiography
              });
            });
          } else {
            callback(null, profile);
          }
        });
      },
      followerNumber: function(callback) {
        Follow.find({where: {followeeId: id}}, function(err, list) {
          if (err) { return callback(err); }
          callback(null, list.length);
        });
      },
      followingNumber: function(callback) {
        Follow.find({where: {followerId: id}}, function(err, list) {
          if (err) { return callback(err); }
          callback(null, list.length);
        });
      },
      postNumber: function(callback) {
        Post.find({where: {ownerId: id}}, function(err, list) {
          if (err) { return callback(err); }
          callback(null, list.length);
        });
      },
      isFollowing: function(callback) {
        if (!req.accessToken) {
          var error = new Error('Bad Request: missing access token');
          error.status = 401;
          return callback(error);
        }
        // check if the access token is valid
        User.findById(req.accessToken.userId, function(err, profile) {
          if (err) { return callback(err); }
          if (!profile) { return callback(new Error('No user with this access token was found.')); }
          // check if we are getting someone else's profile
          assert(profile.sid);
          if (id !== profile.sid) {
            // we are getting someone's profile data, check if we have followed him/her or not
            Follow.find({where: {followerId: profile.sid, followeeId: id}}, function(err, list) {
              if (err) { return callback(err); }
              if (list.length !== 0) { return callback(null, true); }
              else { return callback(null, false); }
            });
          } else {
            // we are checking our own profile data
            callback(null, false);
          }
        });
      }
    }, function(err, results) {
      if (err) {
        if (err.status && err.status >= 400) {
          return callback(err);
        }
        console.error(err);
        return callback(new Error('Internal Error'));
      }
      var output = {
        sid: id,
        username: results.basicProfile.username,
        profilePhotoUrl: results.basicProfile.profilePhotoUrl,
        autobiography: results.basicProfile.autobiography,
        followers: results.followerNumber,
        following: results.followingNumber,
        posts: results.postNumber,
        isFollowing: results.isFollowing
      };
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
    var Post = User.app.models.post;
    var Follow = User.app.models.follow;
    var where = json.where || undefined;
    var PAGE_SIZE = 12;
    var limit = PAGE_SIZE; // default limit

    if (json.limit) {
      if (typeof json.limit === 'string') {
        json.limit = parseInt(json.limit, 10);
      }
      if (json.limit > 0) {
        limit = json.limit;
      }
    }
    var result = [];
    var query = {
      where: {
        status: 'completed'
      },
      order: 'sid DESC',
      limit: limit + 1, // to see if we have next page
      include: {
        relation: 'location',
        scope: {
          fields: [ 'name', 'geo', 'city', 'street', 'zip' ]
        }
      }
    };
    // TODO: should have a more comprehensive parser for parsing the where query
    if (where && (typeof where === 'object')) {
      try {
        if ((where.sid.hasOwnProperty('lt') && (typeof where.sid.lt === 'string')) ||
            (where.sid.hasOwnProperty('gt') && (typeof where.sid.gt === 'string')))
          {
            query.where.sid = where.sid;
          } else {
            var error = new Error('Invalid query operator');
            error.status = 400;
            return callback(error);
          }
      } catch (e) {
        var error = new Error('Bad request');
        error.status = 400;
        return callback(error);
      }
    }

    query.where.ownerId = id;
    Post.find(query, function(err, posts) {
      if (err) { return callback(err); }
      posts.sort(descending);
      var output = { page: {}, feed: [] }, i;
      if (posts.length > limit) {
        output.page.hasNextPage = true;
        output.page.count = limit;
        output.page.start = posts[0].sid;
        output.page.end = posts[limit - 1].sid;
        output.feed = posts.slice(0, limit);
      } else if (0 < posts.length && posts.length <= limit) {
        output.page.hasNextPage = false;
        output.page.count = posts.length;
        output.page.start = posts[0].sid;
        output.page.end = posts[posts.length - 1].sid;
        output.feed = posts.slice(0, posts.length);
      } else {
        output.page.hasNextPage = false;
        output.page.count = 0;
        output.page.start = null;
        output.page.end = null;
      }
      var Like = Post.app.models.like;
      async.each(output.feed, function(post, callback) {
        async.parallel({
          likeCount: function(callback) {
            Like.find({where: {postId: post.sid}}, function(err, list) {
              if (err) { return callback(err); }
              callback(null, list.length);
            });
          },
          isLiked: function(callback) {
            if (!req.accessToken) {
              var error = new Error('Bad Request: missing access token');
              error.status = 400;
              return callback(error);
            }
            User.findById(req.accessToken.userId, function(err, profile) {
              if (err) { return callback(err); }
              if (!profile) { return callback(new Error('No user with this access token was found.')); }
              Like.find({where: {postId: post.sid, userId: req.accessToken.userId}}, function(err, list) {
                if (err) { return callback(err); }
                if (list.length !== 0) { callback(null, true); }
                else { callback(null, false); }
              });
            });
          },
          ownerInfo: function(callback) {
            User.findById(post.ownerId, {
              fields: [ 'sid', 'username', 'profilePhotoUrl' ],
              include: {
                relation: 'identities',
                scope: {
                  fields: [ 'provider', 'profile' ]
                }
              }
            }, function(err, user) {
              if (err) { return callback(err); }
              if (!user) {
                var error = new Error('Internal Error');
                error.status = 500;
                return callback(error);
              }
              callback(null, user);
            });
          }
        }, function(err, results) {
          if (err) { return callback(err); }
          post.likes = {
            count: results.likeCount,
            isLiked: results.isLiked
          };
          post.ownerInfo = results.ownerInfo;
          callback();
        });
      }, function(err) {
        if (err) {
          console.error(err);
          return callback(new Error('Internal Error'));
        }
        callback(null, output);
      });
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
      var error = new Error('Missing Information');
      error.status = 400;
      return callback(error);
    }
    User.findById(id, function(err, user) {
      var error;
      if (err) { return callback(err); }
      if (!user) {
        error = new Error('User Not Found');
        error.status = 404;
        return callback(error);
      }
      user.hasPassword(oldPassword, function(err, isMatch) {
        if (err) { return callback(err); }
        if (isMatch) {
          user.updateAttribute('password', newPassword, callback);
        } else {
          error = new Error('Incorrect Old Password');
          error.status = 401;
          callback(error);
        }
      });
    });
  };
  User.remoteMethod('changePassword', {
    accepts: [
      { arg: 'id', type: 'string', require: true },
      { arg: 'json', type: 'object', 'http': { source: 'body' } }
    ],
    returns: [ { arg: 'result', type: 'string' } ],
    http: { path: '/:id/changePassword', verb: 'post' }
  });

  User.createFeedback = function(id, json, callback) {
    User.findById(id, function(err, user) {
      if (err) { return callback(err); }
      if (!user) { return callback(new Error('No user with the id was found')); }
      if (!user.email) { return callback(new Error('Internal Error')); }
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
            console.error(err);
            return callback(err);
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
