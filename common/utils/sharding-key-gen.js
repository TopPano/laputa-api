var crypto = require('crypto');
(function() {
  'use strict';
  module.exports = function() {
    var keylen = 4;
    return crypto.randomBytes(Math.ceil(keylen/2)).toString('hex');
  };
})();
