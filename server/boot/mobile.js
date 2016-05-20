var CURRENT_VERSON = '1.1.0';
module.exports = function(server) {
  var router = server.loopback.Router();
  router.get('/api/mobile/ios/version', function(req, res) {
    res.send({version: CURRENT_VERSON});
  });
  server.use(router);
};
