var loopback = require('loopback');
var boot = require('loopback-boot');

var app = module.exports = loopback();

app.start = function() {
  // start the web server
  return app.listen(function() {
    app.emit('started');
    var baseUrl = app.get('url').replace(/\/$/, '');
    console.log('Web server listening at: %s', baseUrl);
    if (app.get('loopback-component-explorer')) {
      var explorerPath = app.get('loopback-component-explorer').mountPath;
      console.log('Browse your REST API at %s%s', baseUrl, explorerPath);
    }
  });
};

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, function(err) {
  if (err) throw err;
});

// Configure the middleware for parsing request body.
var multer = require('multer');
var bodyParser = require('body-parser');
app.middleware('parse', multer({
    storage: multer.memoryStorage(),
    limits: {
      fieldSize: 200 * 1024 * 1024 /* 200MB */,
      fields: 20,
      files: 2,
      parts: 22
    }
  })
  .fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'image', maxCount: 1 }
  ])
); // for parsing multipart/form-data
app.middleware('parse', bodyParser.json());
app.middleware('parse', bodyParser.urlencoded({ extended: true }));

// start the server if `$ node server.js`
if (require.main === module) {
  app.start();
}
