/**
 * Tracks third-party logins and profiles.
 *
 * @param {String} provider   Auth provider name, such as facebook, google, twitter, linkedin
 * @param {String} authScheme Auth scheme,
 * @param {String} externalId Provider specific user ID.
 * @param {Object} profiles User profile.
 * @param {Object} credentials Credentials.
 */

'use strict';

module.exports = function(UserIdentity) {
  var loopback = require('loopback');
  var genHmac = require('../utils').genHmac;

  function createAccessToken(user, ttl, callback) {
    if (arguments.length === 2 && typeof ttl === 'function') {
      callback = ttl;
      ttl = 0;
    }
    user.accessTokens.create({
      created: new Date(),
      ttl: Math.min(ttl || user.constructor.settings.ttl, user.constructor.settings.maxTTL)
    }, callback);
  }

  function profileToUser(provider, profile, options) {
    // Let's create a user for that
    var email = profile.emails && profile.emails[0] && profile.emails[0].value;
    if (!email && !options.emailOptional) {
      // Fake an e-mail
      email = (profile.username || profile.id) + '@verpix.' +
              (profile.provider || provider) + '.me';
    }
    var username = provider + '.' + (profile.username || profile.id);
    var password = genHmac('password');
    var userObj = {
      username: username,
      password: password
    };
    if (email) {
      userObj.email = email;
    }
    return userObj;
  }

  /**
   * Log in with a third-party provider such as Facebook or Google.
   */
  UserIdentity.login = function(provider, authScheme, profile, credentials, options, callback) {
    options = options || {};
    if (typeof options === 'function' && callback === undefined) {
      callback = options;
      options = {};
    }
    UserIdentity.findOne({ where: {
      provider: provider,
      externalId: profile.id
    }}, function(err, identity) {
      if (err) { return callback(err); }
      if (identity) {
        identity.credentials = credentials;
        return identity.updateAttributes({
          profile: profile,
          credentials: credentials,
          modified: new Date()
        }, function(err, i) {
          // Find the user for the given identity
          return identity.user(function(err, user) {
            // Create access token
            if (!err && user) {
              return createAccessToken(user, function(err, token) {
                callback(err, user, identity, token);
              });
            }
            callback(err, user, identity);
          });
        });
      }
      var User = UserIdentity.app.models.user;
      var userObj = profileToUser(provider, profile, options);
      if (!userObj.email && !options.emailOptional) {
        process.nextTick(function() {
          return callback('email is missing from the user profile');
        });
      }

      var query;
      if (userObj.email) {
        query = { or: [
          { username: userObj.username },
          { email: userObj.email }
        ]};
      } else {
        query = { username: userObj.username };
      }
      User.findOrCreate({ where: query }, userObj, function(err, user) {
        if (err) { return callback(err); }
        var date = new Date();
        UserIdentity.create({
          provider: provider,
          externalId: profile.id,
          authScheme: authScheme,
          profile: profile,
          credentials: credentials,
          userId: user.id,
          created: date,
          modified: date
        }, function(err, identity) {
          if (!err && user) {
            return createAccessToken(user, function(err, token) {
              callback(err, user, identity, token);
            });
          }
          callback(err, user, identity);
        });
      });
    });
  };
};
