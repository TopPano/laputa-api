'use strict';
var async = require('async');

module.exports = function(User) {

  var verifyFollowing = function(followerId, followeeId, done) {
    async.parallel({
      verifyFollower: function(callback) {
        User.findById(followerId, function(err, user) {
          if (err) { return callback(err); }
          if (!user) { return callback('Invalid User ID: '+followerId); }
          callback(null);
        });
      },
      verifyFollowee: function(callback) {
        User.findById(followeeId, function(err, user) {
          if (err) { return callback(err); }
          if (!user) { return callback('Invalid User ID: '+followeeId); }
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
        if (err.indexOf('Invalid User') !== -1) {
          var error = new Error(err);
          error.status = 404;
          return callback(error);
        }
        return callback(err);
      }
      var Follow = User.app.models.follow;
      Follow.create({followerId: followerId, followeeId: followeeId}, function(err) {
        // Ignore duplicate following
        if (err && err.message.indexOf('Duplicate') === -1) {
          return callback(err);
        }
        callback(null, 'success');
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
        if (err.indexOf('Invalid User') !== -1) {
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
