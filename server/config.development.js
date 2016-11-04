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
  hostname: 'dev.verpix.net',
  bucketName: process.env.BKT_NAME,
  cdnUrl: 'www.fake.cdn',
  host: process.env.HOST || '0.0.0.0',
  port: process.env.PORT || 3000,
  restApiRoot: '/api' + (version > 0 ? '/v' + version : ''),
  passportProviders: {
    'facebook-token': {
      clientID: '630397387117048',
      clientSecret: 'ddd9f4c7bdd4c32b6cd8061724718140'
    }
  }
};
