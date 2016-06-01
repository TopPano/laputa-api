'use strict';

var app = require('../server/server');
var fs = require('fs');
var bluebird = require('bluebird');

// Global before hook
before(function(done) {
  app.once('started', function() {
    var User = app.models.user;
    var UserIdentity = app.models.userIdentity;
    var Post = app.models.post;
    var Like = app.models.like;
    var Follow = app.models.follow;

    done();
  });
  app.start();
});

after(function(done) {
  app.removeAllListeners('started');
  done();
});

