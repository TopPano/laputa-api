var loopback = require('loopback');
var boot = require('loopback-boot');

const licensing = require('./middleware/licensing.js');
const rateLimit = require('./middleware/rateLimit.js');

const P = require('bluebird');
const redis = require('redis');

var app = module.exports = loopback();

// TODO: disable licensing & rateLimit,
//       because it's not developed and tested completely yet
/*
// set invoking rateLimit after findMediaById
// set rateLimit into beforeRemote('findMediaById');
app.on('started', () => {
  app.middlewareFromConfig(licensing, {
    enabled: true,
    name: 'licensing',
    phase: 'routes:before',
    methods: ['GET'],
    paths: ['/api/media/:id/'],
    params: {
      projProfile: app.models.projProfile
    }
  });

  P.promisifyAll(redis.RedisClient.prototype);
  let redisCli;

  // TODO: need error handler if redisCli failed
  redisCli = redis.createClient(6379, app.get('redisHost'));

  let Media = app.models.Media;
  Media.afterRemote('findMediaById', (context, remoteMethodOutput, next) => {
    let mWare = rateLimit(redisCli);
    mWare(context, next);
  });
});
*/

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
  // for production mode, check the env variables are set before start 
  if (process.env.NODE_ENV === 'production') {
    if (!app.get('cdnUrl') || !app.get('bucketName') || !app.get('redisHost')) {
      throw 'Environment variables are not set correctly';
    }
  }
  app.start();
}
