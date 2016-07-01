'use strict';
var merge = require('merge');

var genHmac = require('./genHmacUtil');
var respObjFormatter = require('./respObjFormatter');
var verpixUtils = require('./verpix-utils');

module.exports = merge({}, respObjFormatter, verpixUtils, {
  genHmac: genHmac
});
