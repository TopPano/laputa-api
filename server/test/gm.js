var gm = require('gm');
var fs = require('fs');
var async = require('async');
var filename = process.argv[2] || undefined;
var modelId = process.argv[3] || undefined;
var quality = process.argv[4] || undefined;
var shardingKey = 'beef';
var timestamp = '2015-12-30';

if (!filename) {
  return console.log('missing input filename');
}
if (!modelId) {
  return console.log('missing model id');
}
if (quality !== 'high' &&
    quality !== 'low' &&
    quality !== 'thumb') {
  return console.log('invalid quality string: '+quality);
}

var srcFile = __dirname+'/data/images/models/'+modelId+'/'+shardingKey+'/pan/src/'+timestamp+'/'+filename;
var layoutHigh = [
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
];
var layoutLow = [
    {
      id: 0,
      width: 1024,
      height: 1024,
      x: 0,
      y: 0
    },
    {
      id: 1,
      width: 1024,
      height: 1024,
      x: 1024,
      y: 0
    },
    {
      id: 2,
      width: 1024,
      height: 1024,
      x: 2048,
      y: 0
    },
    {
      id: 3,
      width: 1024,
      height: 1024,
      x: 3072,
      y: 0
    },
    {
      id: 4,
      width: 1024,
      height: 1024,
      x: 0,
      y: 1024
    },
    {
      id: 5,
      width: 1024,
      height: 1024,
      x: 1024,
      y: 1024
    },
    {
      id: 6,
      width: 1024,
      height: 1024,
      x: 2048,
      y: 1024
    },
    {
      id: 7,
      width: 1024,
      height: 1024,
      x: 3072,
      y: 1024
    }
];

function cropImage(inputPath, outputPath, layout, callback) {
  async.eachSeries(layout, function(tile, callback) {
    gm(inputPath)
    .crop(tile.width, tile.height, tile.x, tile.y)
    .write(outputPath+filename.slice('.')[0]+'_equirectangular_'+tile.id+'.jpg', function(err) {
      if (err) { return callback(err); }
      callback();
    });
  }, function(err) {
    if (err) { return callback(err); }
    callback();
  });
}

var outputPath = __dirname+'/data/images/models/'+modelId+'/'+shardingKey+'/pan/'+quality+'/'+timestamp+'/';
if (quality === 'high') {
  cropImage(srcFile, outputPath, layoutHigh, function(err) {
    if (err) { console.log(err); }
  });
} else if (quality === 'low') {
  var tmpFile = './resized.jpg'
  gm(srcFile)
  .resize(4096, 2048)
  .write(tmpFile, function(err) {
    if (err) { console.log(err); }
    cropImage(tmpFile, outputPath, layoutLow, function(err) {
      if (err) { console.log(err); }
      fs.unlinkSync(tmpFile);
    });
  });
} else if (quality === 'thumb') {
  gm(srcFile)
  .thumb(400, 200, outputPath+filename.slice('.')[0]+'.jpg', 90, function(err) {
    if (err) { console.log(err); }
  });
}
