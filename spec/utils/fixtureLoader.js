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
        var UserIdentity = this.app.models.userIdentity;
        var Media = this.app.models.media;
        var users = Loader.normalize('users', JSON.parse(fs.readFileSync(this.fixturePath + 'user.json', 'utf8')));
        var userIdentities = Loader.normalize('userIdentities', JSON.parse(fs.readFileSync(this.fixturePath + 'userIdentity.json', 'utf8')), { idAttribute: 'userId' });
        var medias = Loader.normalize('medias', JSON.parse(fs.readFileSync(this.fixturePath + 'media.json', 'utf8')));
        if (!users || !medias || !userIdentities) {
          throw new Error('Invalid fixture data');
        }

        async.each(users.result.users, function(userId, callback) {
          User.create(users.entities.users[userId], function(err, newUser) {
            if (err) { return callback(err); }
            if (!newUser) { return callback(new Error('Failed to create user: '+userId)); }
            async.parallel({
              createIdentity: function(callback) {
                if (userIdentities.entities.userIdentities[userId]) {
                  userIdentities.entities.userIdentities[userId]['userId'] = newUser.sid;
                  UserIdentity.create(userIdentities.entities.userIdentities[userId], function(err) {
                    if (err) { return callback(err); }
                    callback();
                  });
                } else {
                  callback();
                }
              },
              createMedias: function(callback) {
                async.eachSeries(medias.result.medias, function(mediaId, callback) {
                  if (medias.entities.medias[mediaId].ownerId === userId) {
                    medias.entities.medias[mediaId].ownerId = newUser.id;
                    Media.create(medias.entities.medias[mediaId], function(err) {
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
        var Media = this.app.models.media;
        async.parallel({
          cleanUser: function(callback) {
            User.destroyAll(callback);
          },
          cleanMedia: function(callback) {
            Media.destroyAll(callback);
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
