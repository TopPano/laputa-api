var fs = require('fs');
var async = require('async');

function installImageRoute(server) {
  var router = server.loopback.Router();
  console.log('installing route: /images');

  router.get('/images/models/:modelId/:shardingKey/:type/:quality/:timestamp/:filename', function(req, res) {
    var modelId = req.params.modelId;
    var shardingKey = req.params.shardingKey;
    var type = req.params.type;
    var quality = req.params.quality;
    var timestamp = req.params.timestamp;
    var filename = req.params.filename;

    var filepath = __dirname+'/data/images/models/'+modelId+'/'+shardingKey+'/'+type+'/'+quality+'/'+timestamp+'/'+filename;
    fs.readFile(filepath, function(err, data) {
      if (err) {
        console.log(err);
        return res.status(404).send({error: 'Image not found'});
      }
      res.contentType('image/jpg');
      res.send(data);
    });
  });

  server.use(router);
}

function loadTestData(server, callback) {
  fs.readdir(__dirname+'/data', function(err, files) {
    if (err) { return callback(err); }
    async.each(files, function(file, cb) {
      if (file.indexOf('.js') !== -1) {
        require('./data/sample-data')(server, function(err) {
          if (err) { return cb(err); }
          cb();
        });
      } else {
        cb();
      }
    },
    function(err) {
      if (err) {
        return callback(err);
      }
      callback();
    });
  });
}

module.exports = {
  loadTestData: loadTestData,
  installImageRoute: installImageRoute
};
