var gearmanode = require('gearmanode');
var moment = require('moment');
var worker = gearmanode.worker();
var gm = require('gm');
var S3Uploader = require('../utils/S3Uploader');
var assert = require('assert');
var genShardingKey = require('../utils/sharding-key-gen');
var request = require('request');
var async = require('async');
var zlib = require('zlib');

var HOST = process.env.HOST || 'localhost:3000';

function getTimeNow() {
  return moment(new Date()).format('YYYY-MM-DD');
}

function upload(params, callback) {
  var uploader = new S3Uploader();
  var shardingKey = genShardingKey();

  try {
    var fileKey = 'posts/'+params.postId+'/'+shardingKey+'/'+params.type+'/'+params.quality+'/'+params.timestamp+'/'+params.imageFilename;
    uploader.on('success', function(data) {
      assert(data.hasOwnProperty('Location'), 'Unable to get location proerty from S3 response object');
      assert((data.hasOwnProperty('key') || data.hasOwnProperty('Key')), 'Unable to get key property from S3 response object');
      var s3Filename = data.key || data.Key;
      var s3Url = data.Location;
      // TODO: use real CDN download url
      var cdnFilename = data.key || data.Key;
      var cdnUrl = data.Location;
      callback(null, {
        cdnFilename: cdnFilename,
        cdnUrl: cdnUrl,
        s3Filename: s3Filename,
        s3Url: s3Url
      });
    });
    uploader.on('error', function(err) {
      callback(err);
    });
    uploader.send({
      File: params.image,
      Key: fileKey,
      options: {
        ACL: 'public-read'
      }
    });
  } catch (err) {
    callback(err);
  }
}

function processImage(params, callback) {
  var now = getTimeNow();

  async.parallel({
    webImages: function(callback) {
      var tileGeometries = calTileGeometries(params.width, params.height);
      var files = [];
      async.each(tileGeometries, function(tile, callback) {
        gm(params.image)
        .crop(tile.width, tile.height, tile.x, tile.y)
        .toBuffer('JPG', function(err, buffer) {
          if (err) { return callback(err); }
          upload({
            type: 'pan',
            quality: 'high',
            postId: params.postId,
            timestamp: now,
            imageFilename: params.nodeId+'_equirectangular_'+tile.idx+'.jpg',
            image: buffer
          }, function(err, result) {
            if (err) { return callback(err); }
            files.push({
              name: result.cdnFilename,
              url: result.cdnUrl,
              postId: params.postId,
              nodeId: params.nodeId
            });
            callback();
          });
        });
      }, function(err) {
        if (err) { return callback(err); }
        callback(null, files);
      });
    },
    mobileImages: function(callback) {
      gm(params.image)
      .resize(4096, 2048)
      .toBuffer('JPG', function(err, buffer) {
        if (err) { return callback(err); }
        async.parallel({
          downsized: function(callback) {
            upload({
              type: 'pan',
              quality: 'src',
              postId: params.postId,
              timestamp: now,
              imageFilename: params.nodeId+'_low.jpg',
              image: buffer
            }, function(err, result) {
              if (err) { return callback(err); }
              callback(null, result);
            });
          },
          tiled: function(callback) {
            var tileGeometries = calTileGeometries(4096, 2048);
            var files = [];
            async.each(tileGeometries, function(tile, callback) {
              gm(buffer)
              .crop(tile.width, tile.height, tile.x, tile.y)
              .toBuffer('JPG', function(err, buffer) {
                if (err) { return callback(err); }
                upload({
                  type: 'pan',
                  quality: 'low',
                  postId: params.postId,
                  timestamp: now,
                  imageFilename: params.nodeId+'_equirectangular_'+tile.idx+'.jpg',
                  image: buffer
                }, function(err, result) {
                  if (err) { return callback(err); }
                  files.push({
                    name: result.cdnFilename,
                    url: result.cdnUrl,
                    postId: params.postId,
                    nodeId: params.nodeId
                  });
                  callback();
                });
              });
            }, function(err) {
              if (err) { return callback(err); }
              callback(null, files);
            });
          }
        }, function(err, results) {
          if (err) { return callback(err); }
          callback(null, results);
        });
      });
    }
  }, function(err, results) {
    if (err) { return callback(err); }
    callback(null, results);
  });

  function calTileGeometries(imgWidth, imgHeight) {
    var tileWidth = imgWidth / 4;
    var tileHeight = imgHeight / 2;
    var tileGeometries = [0, 1, 2, 3, 4, 5, 6, 7].map(function(i) {
      var geometry = {};
      geometry.idx = i;
      geometry.width = tileWidth;
      geometry.height = tileHeight;
      if (i < 4) {
        geometry.x = i * tileWidth;
        geometry.y = 0;
      } else {
        geometry.x = (i % 4) * tileWidth;
        geometry.y = tileHeight;
      }
      return geometry;
    });
    return tileGeometries;
  }
}

function replyComplete(options, callback) {
  assert(typeof options === 'object');
  assert(options.postId);
  assert(options.nodeId);
  request({
    method: 'POST',
    uri: 'http://'+HOST+'/api/posts/'+options.postId+'/nodes/'+options.nodeId+'/callabck',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: options.status,
      response: options.response
    })
  }, callback);
}

worker.addFunction('process image', function(job) {
  var params = JSON.parse(job.payload);
  var options = {
    postId: params.postId,
    nodeId: params.nodeId,
    response: {}
  };
  if (params.image.hasZipped) {
    zlib.inflate(new Buffer(params.image.buffer, 'base64'), function(err, uzImgBuf) {
      if (err) {
        options.status = 'failure';
        replyComplete(options, function(err) {
          if (err) { console.error(err); }
        });
        return;
      }
      processImage({
        width: params.image.width,
        height: params.image.height,
        image: uzImgBuf,
        postId: params.postId,
        nodeId: params.nodeId
      }, function(err, results) {
        if (err) {
          options.status = 'failure';
          console.error(err);
          replyComplete(options, function(err) {
            if (err) { console.error(err); }
          });
          return;
        }
        options.status = 'success';
        options.response.srcMobileUrl = results.mobileImages.downsized.s3Url;
        options.response.srcMobileDownloadUrl = results.mobileImages.downsized.cdnUrl;
        options.response.files = results.webImages.concat(results.mobileImages.tiled);
        replyComplete(options, function(err) {
          if (err) { console.error(err); }
        });
      });
    });
  }
});
