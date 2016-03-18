var passport = require('passport');
module.exports = function (server) {
  var config = {};
  try {
    config = require('../providers.json');
  } catch (err) {
    console.trace(err);
    process.exit(1);  // fatal
  }

  server.middleware('session:after', passport.initialize());

  var FacebookTokenStrategy = require('passport-facebook-token');
  var provider = 'facebook-token';
  passport.use(provider, new FacebookTokenStrategy({
    clientID: config[provider].clientID,
    clientSecret: config[provider].clientSecret
  }, function(accessToken, refreshToken, profile, done) {
    var userIdentityModel = server.models.userIdentity;
    userIdentityModel.login(provider, config.authScheme, profile, {
      accessToken: accessToken,
      refreshToken: refreshToken
    }, function(err, user, identity, token) {
      var authInfo = {
        identity: identity
      };
      if (token) {
        authInfo.accessToken = token;
      }
      done(err, user, authInfo);
    });
  }));
};
