var loopback = require('loopback');
var boot = require('loopback-boot');
var multer = require('multer');
var passport = require('passport');

var app = module.exports = loopback();

app.start = function() {
  // start the web server
  return app.listen(function() {
    app.emit('started');
    var baseUrl = app.get('url').replace(/\/$/, '');
    console.log('Web server listening at: %s', baseUrl);
    if (app.get('loopback-component-explorer')) {
      var explorerPath = app.get('loopback-component-explorer').mountPath;
      console.log('Browse your REST API at %s%s', baseUrl, explorerPath);
    }
  });
};

// Attempt to build the providers/passport config
var config = {};
try {
  config = require('./providers.json');
} catch (err) {
  console.trace(err);
  process.exit(1); // fatal
}

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, function(err) {
  if (err) throw err;
});

app.use(loopback.token({currentUserLiteral: 'me'}));
app.use(multer({storage: multer.memoryStorage()}).fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'image', maxCount: 1 }
])); // for parsing multipart/form-data

app.middleware('session:after', passport.initialize());

var FacebookTokenStrategy = require('passport-facebook-token');
var provider = 'facebook-token-login';
passport.use(provider, new FacebookTokenStrategy({
  clientID: config[provider].clientID,
  clientSecret: config[provider].clientSecret,
  passReqToCallback: true
}, function(req, accessToken, refreshToken, profile, done) {
  var userIdentityModel = app.models.userIdentity;
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
/*
passportConfigurator.init();
passportConfigurator.setupModels({
  userModel: app.models.user,
  userIdentityModel: app.models.userIdentity,
  userCredentialModel: app.models.userCredential
});
for (var s in config) {
  var c = config[s];
  c.session = c.session !== false;
  passportConfigurator.configureProvider(s, c);
}
*/

// start the server if `$ node server.js`
if (require.main === module) {
  app.start();
}
