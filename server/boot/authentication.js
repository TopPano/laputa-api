var loopback = require('loopback');
module.exports = function enableAuthentication(server) {
  // enable authentication
  server.enableAuth();

  // check for access token in cookies, headers, and query string parameters
  server.use(loopback.token({currentUserLiteral: 'me'}));

  // keep alive the token if it is active
  server.use(function(req, res, next) {
    var token = req.accessToken;
    if (!token) { return next(); }
    var now = new Date();
    var elapsed = now.getTime() - token.created.getTime();
    if (elapsed < 604800000 /* one week in milliseconds */) {
      // performance optimization:
      // do not update the token more often than once per week
      // XXX: ttl should NOT be less than a week otherwise the token
      //      will never be updated
      return next();
    }
    if (elapsed > (token.ttl * 1000 /* convert ttl into milliseconds */)) {
      // don't extend the token if it has already expired
      return next();
    }
    req.accessToken.created = now;
    req.accessToken.ttl = 2419200; // four week in seconds
    req.accessToken.save(next);
  });
};
