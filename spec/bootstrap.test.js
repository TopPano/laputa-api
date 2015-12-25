'use strict';

var app = require('../server/server');

// Global before hook
before(function(done) {
  app.once('started', function() {
    done();
  });
  app.start();
});

after(function(done) {
  app.removeAllListeners('started');
  done();
});

