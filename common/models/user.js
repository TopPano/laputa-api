'use strict';
var assert = require('assert');
var async = require('async');
var S3Uploader = require('../utils/S3Uploader');

module.exports = function(User) {

  var PAGE_SIZE = 12;
  User.query = function(id, json, callback) {
    var Post = User.app.models.post;
    var Follow = User.app.models.follow;
    var where = json.where || undefined;
    var limit = PAGE_SIZE; // default limit

    if (json.limit && (typeof json.limit === 'number') && (0 < json.limit <= (PAGE_SIZE * 3))) {
      limit = json.limit;
    }
    Follow.find({where: {followerId: id}}, function(err, followings) {
      if (err) {
        console.error(err);
        return callback(err);
      }
      var result = [];
      async.each(followings, function(following, callback) {
        var query = {
          where: {
            ownerId: following.followeeId
          },
          limit: limit + 1 // to see if we have next page
        };
        // TODO: should have a more comprehensive parser for parsing the where query
        if (where && (typeof where === 'object')) {
          try {
            if ((where.sid.hasOwnProperty('lt') && (typeof where.sid.lt === 'string')) ||
                (where.sid.hasOwnProperty('gt') && (typeof where.sid.gt === 'string'))) {
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
        Post.find(query, function(err, posts) {
          if (err) { return callback(err); }
          result = result.concat(posts);
          callback();
        });
      }, function(err) {
        if (err) {
          return callback(err);
        }

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
        callback(null, output);
      });
    });

    function descending(a,b) {
      if (a.sid > b.sid)
        return -1;
      else if (a.sid < b.sid)
        return 1;
      else
        return 0;
    }
  };
  User.remoteMethod('query', {
    accepts: [
      { arg: 'id', type: 'string', require: true },
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
};
