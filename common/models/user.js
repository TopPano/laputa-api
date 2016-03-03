'use strict';
var assert = require('assert');
var async = require('async');
var S3Uploader = require('../utils/S3Uploader');

module.exports = function(User) {

  function descending(a,b) {
    if (a.sid > b.sid)
      return -1;
    else if (a.sid < b.sid)
      return 1;
    else
      return 0;
  }

  User.query = function(id, req, json, callback) {
    var Post = User.app.models.post;
    var Follow = User.app.models.follow;
    var where = json.where || undefined;
    var PAGE_SIZE = 12;
    var limit = PAGE_SIZE; // default limit

    if (json.limit && (typeof json.limit === 'number') && (0 < json.limit) && (json.limit <= (PAGE_SIZE * 3))) {
      limit = json.limit;
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
          limit: query.limit
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
              User.findById(post.ownerId, function(err, user) {
                if (err) { return callback(err); }
                if (!user) {
                  var error = new Error('Internal Error');
                  error.status = 500;
                  return callback(error);
                }
                callback(null, {
                  username: user.username,
                  profilePhotoUrl: user.profilePhotoUrl
                });
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
      Follow.find({where: {followerId: followerId, followeeId: followeeId}}, function(err, result) {
        if (err) { return callback(err); }
        if (result.length === 0) {
          Follow.create({followerId: followerId, followeeId: followeeId, followAt: new Date()}, function(err, result) {
            if (err) { return callback(err); }
            callback(null, 'success');
          });
        } else {
          // Ignore duplicate following
          callback(null, 'success');
        }
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

  User.uploadProfilePhoto = function(id, json, callback) {
    var uploader = new S3Uploader();

    try {
      var image = json.image ? new Buffer(json.image, 'base64') : undefined;
      if (!image) {
        var error = new Error('No image found');
        error.status = 400;
        return callback(error);
      }
      var imageFilename = id+'_profile.jpg';
      var fileKey = 'users/'+id+'/photo/'+imageFilename;
      uploader.on('success', function(data) {
        assert(data.hasOwnProperty('Location'), 'Unable to get location property from S3 response object');
        assert((data.hasOwnProperty('key') || data.hasOwnProperty('Key')), 'Unable to get key property from S3 response object');
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
    async.parallel({
      basicProfile: function(callback) {
        User.findById(id, function(err, profile) {
          if (err) { return callback(err); }
          callback(null, profile);
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
          error.status = 400;
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

    if (json.limit && (typeof json.limit === 'number') && (0 < json.limit) && (json.limit <= (PAGE_SIZE * 3))) {
      limit = json.limit;
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
            User.findById(post.ownerId, function(err, user) {
              if (err) { return callback(err); }
              if (!user) {
                var error = new Error('Internal Error');
                error.status = 500;
                return callback(error);
              }
              callback(null, {
                username: user.username,
                profilePhotoUrl: user.profilePhotoUrl
              });
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
};
