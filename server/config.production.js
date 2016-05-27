/*
 * This file exists for the fact that we can't have 'config.js' to perform
 * programmatic ations for default configuration. This file will always be
 * loaded if exists, either JSON or JS. And it will override the settings of 'config.json'. For more information, please read:
 * https://github.com/strongloop/loopback-boot/issues/101
 */
 'use strict';

var p = require('../package.json');
var version = p.version.split('.').shift();

module.exports = {
  hostname: 'www.verpix.me',
  restApiRoot: '/api' + (version > 0 ? '/v' + version : '')
};
