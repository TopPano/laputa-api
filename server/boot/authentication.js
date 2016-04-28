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
    var time = now.getTime() - token.created.getTime();
    // don't extend the token if it has expired or just been issued less than a week
    // NOTE: ttl should be longer than a week
    if ( time > req.accessToken.ttl || time  < 604800 ) {
      return next();
    }
    req.accessToken.created = now;
    req.accessToken.ttl = 2419200; // four week
    req.accessToken.save(next);
  });
};
