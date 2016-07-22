var passport = require('passport');

module.exports = function (server) {
  server.middleware('session:after', passport.initialize());

  var providers = server.get('passportProviders');
  Object.keys(providers).forEach(function(provider) {
    var Strategy = require(providers[provider].module);
    passport.use(provider, new Strategy({
      clientID: providers[provider].clientID,
      clientSecret: providers[provider].clientSecret
    }, function(accessToken, refreshToken, profile, done) {
      var userIdentityModel = server.models.userIdentity;
      userIdentityModel.login(provider, providers[provider].authScheme, profile, {
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
  });
};
