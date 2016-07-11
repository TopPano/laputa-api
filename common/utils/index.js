'use strict';
var merge = require('lodash/merge');

var genHmac = require('./genHmacUtil');
var respObjFormatter = require('./respObjFormatter');

module.exports = merge({}, respObjFormatter, {
  genHmac: genHmac
});
