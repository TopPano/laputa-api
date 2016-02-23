'use strict';
var async = require('async');

module.exports = function(User) {

  var PAGE_SIZE = 12;
  User.query = function(id, req, json, callback) {
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

  User.follow = function(followerId, followeeId, req, res, callback) {
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
      { arg: 'followeeId', type: 'string', require: true },
      { arg: 'req', type: 'object', 'http': { source: 'req' } },
      { arg: 'res', type: 'object', 'http': { source: 'res' } }
    ],
    returns: [ { arg: 'status', type: 'string' } ],
    http: { path: '/:followerId/follow/:followeeId', verb: 'post' }
  });

  User.unfollow = function(followerId, followeeId, req, res, callback) {
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
      { arg: 'followeeId', type: 'string', require: true },
      { arg: 'req', type: 'object', 'http': { source: 'req' } },
      { arg: 'res', type: 'object', 'http': { source: 'res' } }
    ],
    returns: [ { arg: 'status', type: 'string' } ],
    http: { path: '/:followerId/unfollow/:followeeId', verb: 'post' }
  });

};
