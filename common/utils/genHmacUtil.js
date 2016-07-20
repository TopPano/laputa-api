var crypto = require('crypto');
var assert = require('assert');
(function() {
  'use strict';
  /**
   * Generate a key
   * @param {String} hmacKey The key for create HMAC
   * @param {String} alogrithm The algorithm, default to 'sha1'
   * @param {String} encoding The string encoding, default to 'hex'
   * @returns {String} The generated key
   */
  module.exports = function(hmacKey, algorithm, encoding) {
    assert(hmacKey, 'HMAC key is required');
    algorithm = algorithm || 'sha1';
    encoding = encoding || 'hex';
    var hmac = crypto.createHmac(algorithm, hmacKey);
    var buf = crypto.randomBytes(32);
    hmac.update(buf);
    var key = hmac.digest(encoding);
    return key;
  };
})();
