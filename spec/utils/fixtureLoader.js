(function() {
  'use strict';
  var fs = require('fs');
  var async = require('async');
  var normalizr = require('normalizr');

  var Loader = module.exports = function(app, fixturePath) {
    this.app = app;
    this.fixturePath = fixturePath || '../api/fixtures/';
    if (this.fixturePath.substr(this.fixturePath.length - 1) !== '/') {
      this.fixturePath += '/';
    }
  };

  Loader.normalize = function(name, array, options) {
    if (!options) { options = {}; }
    var idAttribute = options.idAttribute || '_id';
    var obj = {};
    var schema = {};
    obj[name] = array;
    schema[name] = normalizr.arrayOf(new normalizr.Schema(name, { idAttribute: idAttribute }));
    var normalizedObj = normalizr.normalize(obj, schema);
    normalizedObj.result[name].forEach(function(id) {
      delete normalizedObj.entities[name][id][idAttribute];
    });
    return normalizedObj;
  };

  Loader.prototype = {
    load: function(callback) {
      try {
        var User = this.app.models.user;
        var Post = this.app.models.post;
        var users = Loader.normalize('users', JSON.parse(fs.readFileSync(this.fixturePath + 'user.json', 'utf8')));
        var posts = Loader.normalize('posts', JSON.parse(fs.readFileSync(this.fixturePath + 'post.json', 'utf8')));

        if (!users || !posts) {
          throw new Error('Invalid fixture data');
        }

        async.each(users.result.users, function(userId, callback) {
          User.create(users.entities.users[userId], function(err, newUser) {
            if (err) { return callback(err); }
            if (!newUser) { return callback(new Error('Failed to create user: '+userId)); }
            async.eachSeries(posts.result.posts, function(postId, callback) {
              if (posts.entities.posts[postId].ownerId === userId) {
                posts.entities.posts[postId].ownerId = newUser.id;
                Post.create(posts.entities.posts[postId], function(err) {
                  if (err) { return callback(err); }
                  callback();
                });
              } else {
                callback();
              }
            }, function(err) {
              if (err) { return callback(err); }
              callback();
            });
          });
        }, function(err) {
          if (err) { return callback(err); }
          callback();
        });
      } catch (err) {
        return callback(err);
      }
    },

    clean: function(callback) {
      try {
        var User = this.app.models.user;
        var Post = this.app.models.post;
        async.parallel({
          cleanUser: function(callback) {
            User.destroyAll(callback);
          },
          cleanPost: function(callback) {
            Post.destroyAll(callback);
          }
        }, function(err) {
          if (err) { return callback(err); }
          callback();
        });
      } catch(err) {
        callback(err);
      }
    },

    reset: function(callback) {
      var handleCleanCB = function(err) {
        if (err) { return callback(err); }
        this.load(function(err) {
          if (err) { return callback(err); }
          callback();
        });
      };
      this.clean(handleCleanCB.bind(this));
    }
  };
})();
