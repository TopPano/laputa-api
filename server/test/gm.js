var gm = require('gm');
var async = require('async');
var filename = process.argv[2] || undefined;
var modelId = process.argv[3] || undefined;
var quality = process.argv[4] || undefined;
var timestamp = '2015-12-30';

if (!filename) {
  return console.log('missing input filename');
}
if (!modelId) {
  return console.log('missing model id');
}
if (quality !== 'high' &&
    quality !== 'thumb') {
  return console.log('invalid quality string: '+quality);
}

var srcFilePath = __dirname+'/data/images/models/'+modelId+'/pan/src/'+timestamp+'/'+filename;

function cropImage(outputPath) {
  async.eachSeries([
    {
      id: 0,
      width: 2048,
      height: 2048,
      x: 0,
      y: 0
    },
    {
      id: 1,
      width: 2048,
      height: 2048,
      x: 2048,
      y: 0
    },
    {
      id: 2,
      width: 2048,
      height: 2048,
      x: 4096,
      y: 0
    },
    {
      id: 3,
      width: 2048,
      height: 2048,
      x: 6144,
      y: 0
    },
    {
      id: 4,
      width: 2048,
      height: 2048,
      x: 0,
      y: 2048
    },
    {
      id: 5,
      width: 2048,
      height: 2048,
      x: 2048,
      y: 2048
    },
    {
      id: 6,
      width: 2048,
      height: 2048,
      x: 4096,
      y: 2048
    },
    {
      id: 7,
      width: 2048,
      height: 2048,
      x: 6144,
      y: 2048
    }
  ], function(tile, callback) {
    gm(srcFilePath)
    .crop(tile.width, tile.height, tile.x, tile.y)
    .write(outputPath+filename.slice('.')[0]+'_equirectangular_'+tile.id+'.jpg', function(err) {
      if (err) { callback(err); }
      callback();
    });
  }, function(err) {
    if (err) { console.log(err); }
  });
}

if (quality === 'high') {
  var outputPath = __dirname+'/data/images/models/'+modelId+'/pan/'+quality+'/'+timestamp+'/';
  cropImage(outputPath);
} else if (quality === 'thumb') {
  var output = __dirname+'/data/images/models/'+modelId+'/pan/'+quality+'/'+timestamp+'/'+filename.slice('.')[0]+'.jpg';
  gm(srcFilePath)
  .thumb(400, 200, output, 90, function(err) {
    if (err) { console.log(err); }
  });
}
