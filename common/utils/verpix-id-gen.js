var intformat = require('biguint-format');
(function () {
  'use strict';
  /* jslint bitwise: true */

  /**
   * Represents an ID generator.
   * @exports VerpixId
   * @constructor
   * @param {object=} options - Generator options
   * @param {Number} options.id - Generator identifier. It can have values from 0 to 8192 (13 bits).
   * @param {Number} options.epoch - Number used to reduce value of a generated timestamp.
   */
  var VerpixId = module.exports = function(options) {
    this.options = options || {};

    if (typeof this.options.id !== 'undefined') {
      this.id = this.options.id & 0x1FFF;
    } else {
      this.id = (Math.floor(Math.random() * 10000)) & 0x1FFF;
    }
    this.id <<= 10; // id generator identifier - will not change while generating ids
    this.epoch = +this.options.epoch || 0;
    this.seq = 0;
    this.lastTime = 0;
    this.overflow = false;
    this.seqMask =  0x3FF; // 10 bits
  };

  VerpixId.POW9 = Math.pow(2, 9); // 2 ^ 9
  VerpixId.POW25 = Math.pow(2, 25); // 2 ^ 25

  VerpixId.prototype = {
    /**
     * Generates id
     * +----------------------+----------------------------------+------------------------------+
     * |  Timestamp (41 bits) |  Generator Identifier (13 bits)  |  Sequence Counter (10 bits)  |
     * +----------------------+----------------------------------+------------------------------+
     *
     * @param {callback=} calback The callback that handles the response.
     */
    next: function(callback) {
      var id = new Buffer(8), time = Date.now() - this.epoch;
      id.fill(0);

      // Generates id in the same millisecond as the previous id
      if (time === this.lastTime) {

        if (this.overflow) {
          overflowCond(this. callback);
          return;
        }

        // Increase sequence counter
        this.seq = (this.seq + 1) & this.seqMask;

        // sequence counter exceeded its max value (1023)
        // - set overflow flag and wait till next millisecond
        if (this.seq === 0) {
          this.overflow = true;
          overflowCond(this, callback);
          return;
        }
      } else {
        this.overflow = false;
        this.seq = 0;
      }
      this.lastTime = time;

      id.writeUInt32BE(((time & 0x1) << 23) | this.id | this.seq, 4);
      id.writeUInt8(Math.floor(time / 2) & 0xFF, 4);
      id.writeUInt16BE(Math.floor(time / VerpixId.POW9) & 0xFFFF, 2);
      id.writeUInt16BE(Math.floor(time / VerpixId.POW25) & 0xFFFF, 0);

      // XXX: Default Base64 encoding contains '/' character which will confuse the API server when parsing
      //      the url that contains a base64 encoded id in it, so according to the suggestion of RFC 4648
      //      that we can change a different alphabat for base64url which replace "+" to "-" and "/" to "_".
      //
      //      http://stackoverflow.com/questions/11449577/why-is-base64-encode-adding-a-slash-in-the-result
      var base64UrlId = id.toString('base64').replace(/\//g, '_').replace(/\+/g, '-');
      process.nextTick(callback.bind(null, null, {id: base64UrlId, timestamp: time}));
      //process.nextTick(callback.bind(null, null, {id: intformat(id, 'dec'), timestamp: time}));
    }
  };

  function overflowCond(self, callback) {
    setTimeout(self.next.bind(self, callback), 1);
  }
})();
