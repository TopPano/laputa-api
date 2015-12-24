var testdata = require('./local');
var async = require('async');

module.exports = function loadTestData(server, callback) {
  var User = server.models.user;
  // load users
  async.each(testdata.users, function(user, cb) {
    User.create(user, function(err) {
      if (err) { return cb(err); }
      cb();
    });
  }, function(err) {
    if (err) {
      return callback(err);
    }
    callback();
  });
};

