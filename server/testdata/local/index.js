'use strict';

var fs = require('fs');
var users = JSON.parse(fs.readFileSync(__dirname+'/users.json').toString()).users;

module.exports = {
  users: users
};
