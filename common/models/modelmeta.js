'use strict';
var assert = require('assert');
var moment = require('moment');
var gm = require('gm');
var async = require('async');
var fs = require('fs');
var crypto = require('crypto');
var S3Uploader = require('../utils/S3Uploader');

module.exports = function(Modelmeta) {

  function getTimeNow() {
    return moment(new Date()).format('YYYY-MM-DD');
  }

  function createDir(path, callback) {
    fs.access(path, fs.F_OK, function(err) {
      if (err) {
        require('child_process').exec('mkdir -p '+path, function(err) {
          if (err) { return callback(err); }
          callback();
        });
      } else {
        callback();
      }
    });
  }

  function genShardingKey() {
    var keylen = 4;
    return crypto.randomBytes(Math.ceil(keylen/2)).toString('hex');
  }

  function upload(params, callback) {
    var uploader = new S3Uploader();
    var shardingKey = genShardingKey();

    try {
      if (process.env.NODE_ENV === 'local') {
        var path = './server/test/data/images/models/'+params.modelId+'/'+shardingKey+'/'+params.type+'/'+params.quality+'/'+params.timestamp;
        createDir(path, function(err) {
          if (err) { return callback(err); }
          fs.writeFile(path+'/'+params.imageFilename, params.image, function(err) {
            if (err) { return callback(err); }
            var cdnFilename = '/'+params.type+'/'+params.quality+'/'+params.imageFilename;
            var cdnUrl = 'http://localhost:3000/images/models/'+params.modelId+'/'+shardingKey+'/'+params.type+'/'+params.quality+'/'+params.timestamp+'/'+params.imageFilename;
            var s3Filename = cdnFilename;
            var s3Url = cdnUrl;
            callback(null, cdnFilename, cdnUrl, s3Filename, s3Url);
          });
        });
      } else {
        var fileKey = 'posts/'+params.modelId+'/'+shardingKey+'/'+params.type+'/'+params.quality+'/'+params.timestamp+'/'+params.imageFilename;
        uploader.on('success', function(data) {
          assert(data.hasOwnProperty('Location'), 'Unable to get location proerty from S3 response object');
          assert((data.hasOwnProperty('key') || data.hasOwnProperty('Key')), 'Unable to get key property from S3 response object');
          var s3Filename = data.key;
          var s3Url = data.Location;
          // TODO: use real CDN download url
          var cdnFilename = data.key;
          var cdnUrl = data.Location;
          callback(null, cdnFilename, cdnUrl, s3Filename, s3Url);
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
      }
    } catch (err) {
      callback(err);
    }
  }

  Modelmeta.beforeRemote('*.__create__nodes', function(ctx, instance, next) {

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

    // Property checking
    try {
      var modelId = ctx.req.params.id;
      var nodeId = ctx.args.data.sid;
      var imgBuf = ctx.req.files.image[0].buffer;
      var imgType = ctx.req.files.image[0].mimetype;
      var imgWidth = ctx.req.body.width;
      var imgHeight = ctx.req.body.height;
      var now = getTimeNow();

      if (!imgBuf || !imgType || !imgWidth || !imgHeight) {
        return next(new Error('Missing properties'));
      }
      if (imgType !== 'image/jpeg') {
        return next(new Error('Invalid image type'));
      }

      ctx.nodeFiles = [];

      async.parallel({
        uploadImage: function(callback) {
          upload({
            type: 'pan',
            quality: 'src',
            modelId: modelId,
            timestamp: now,
            imageFilename: nodeId+'.jpg',
            image: imgBuf
          }, function(err, cdnFilename, cdnUrl, s3Filename, s3Url) {
            if (err) { return callback(err); }
            ctx.args.data.srcUrl = s3Url;
            ctx.args.data.srcDownloadUrl = cdnUrl;
            ctx.nodeFiles.push({
              name: cdnFilename,
              url: cdnUrl,
              modelId: modelId
            });
            callback();
          });
        },
        uploadThumb: function(callback) {
          var croppedWidth = imgWidth / 2;
          var croppedHeight = imgHeight / 2;
          var croppedPositionX = imgWidth / 4;
          var croppedPositionY = imgHeight / 4;
          gm(imgBuf)
          .crop(croppedWidth, croppedHeight, croppedPositionX, croppedPositionY)
          .resize(300, 150)
          .toBuffer('JPG', function(err, buffer) {
            if (err) { return callback(err); }
            upload({
              type: 'pan',
              quality: 'thumb',
              modelId: modelId,
              timestamp: now,
              imageFilename: nodeId+'.jpg',
              image: buffer
            }, function(err, cdnFilename, cdnUrl, s3Filename, s3Url) {
              if (err) { return callback(err); }
              ctx.args.data.thumbnailUrl = s3Url;
              callback();
            });
          });
        },
        tileImgHigh: function(callback) {
          var tileGeometries = calTileGeometries(imgWidth, imgHeight);
          async.each(tileGeometries, function(tile, callback) {
            gm(imgBuf)
            .crop(tile.width, tile.height, tile.x, tile.y)
            .toBuffer('JPG', function(err, buffer) {
              if (err) { return callback(err); }
              upload({
                type: 'pan',
                quality: 'high',
                modelId: modelId,
                timestamp: now,
                imageFilename: nodeId+'_equirectangular_'+tile.idx+'.jpg',
                image: buffer
              }, function(err, cdnFilename, cdnUrl) {
                if (err) { return callback(err); }
                ctx.nodeFiles.push({
                  name: cdnFilename,
                  url: cdnUrl,
                  modelId: modelId
                });
                callback();
              });
            });
          }, function(err) {
            if (err) { return callback(err); }
            callback();
          });
        },
        tileImgLow: function(callback) {
          gm(imgBuf)
            .resize(4096, 2048)
            .toBuffer('JPG', function(err, buffer) {
              if (err) { return callback(err); }
              async.parallel({
                uploadResizedImg: function(callback) {
                  upload({
                    type: 'pan',
                    quality: 'src',
                    modelId: modelId,
                    timestamp: now,
                    imageFilename: nodeId+'_low.jpg',
                    image: buffer
                  }, function(err, cdnFilename, cdnUrl, s3Filename, s3Url) {
                    if (err) { return callback(err); }
                    ctx.args.data.srcMobileUrl = s3Url;
                    ctx.args.data.srcMobileDownloadUrl = cdnUrl;
                    callback();
                  });
                },
                tileResizedImg: function(callback) {
                  var tileGeometries = calTileGeometries(4096, 2048);
                  async.each(tileGeometries, function(tile, callback) {
                    gm(buffer)
                    .crop(tile.width, tile.height, tile.x, tile.y)
                    .toBuffer('JPG', function(err, buffer) {
                      if (err) { return callback(err); }
                      upload({
                        type: 'pan',
                        quality: 'low',
                        modelId: modelId,
                        timestamp: now,
                        imageFilename: nodeId+'_equirectangular_'+tile.idx+'.jpg',
                        image: buffer
                      }, function(err, cdnFilename, cdnUrl) {
                        if (err) { return callback(err); }
                        ctx.nodeFiles.push({
                          name: cdnFilename,
                          url: cdnUrl,
                          modelId: modelId
                        });
                        callback();
                      });
                    });
                  }, function(err) {
                    if (err) { return callback(err); }
                    callback();
                  });
                }
              }, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            });
        }
      }, function(err, results) {
        if (err) {
          console.error(err);
          return next(new Error('Internal error'));
        }
        next();
      });
    } catch (err) {
      console.error(err);
      next(new Error('Invalid request'));
    }
  });

  Modelmeta.afterRemote('*.__create__nodes', function(ctx, instance, next) {

    if (ctx.hasOwnProperty('nodeFiles')) {
      async.each(ctx.nodeFiles, function(file, callback) {
        instance.files.create(file, function(err) {
          if (err) { return callback(err); }
          callback();
        });
      }, function(err) {
        if (err) {
          // TODO: rollback the created node instance
          return next(new Error('Internal error'));
        }
        next();
      });
    } else {
      next();
    }
  });

  Modelmeta.beforeRemote('*.__create__snapshots', function(ctx, instance, next) {
    try {
      var modelId = ctx.req.params.id;
      var image = ctx.req.files.image[0].buffer;
      var type = ctx.req.files.image[0].mimetype;

      if (!image || (image.length === 0) || !type) {
        return next(new Error('Missing properties'));
      }
      if (type !== 'image/jpeg' && type !== 'image/jpg') {
        return next(new Error('Invalid image type'));
      }

      upload({
        type: 'pic',
        quality: 'src',
        modelId: modelId,
        timestamp: getTimeNow(),
        imageFilename: ctx.args.data.sid+'.jpg',
        image: image
      }, function(err, cdnFilename, cdnUrl, s3Filename, s3Url) {
        if (err) { return next(new Error('Invalid image type')); }
        ctx.args.data.url = s3Url;
        ctx.args.data.downloadUrl = cdnUrl;
        next();
      });
    } catch (err) {
      console.error(err);
      next(new Error('Invalid request'));
    }
  });

  Modelmeta.afterRemote('*.__get__files', function(ctx, instance, next) {
    if (ctx.result) {
      var result = ctx.result;
      assert(Array.isArray(result));

      var files = {};
      result.forEach(function(file) {
        files[file.name] = file.url;
      });
      ctx.result = files;
    }
    next();
  });

  function getNodeList(modelId, callback) {
    var Nodemeta = Modelmeta.app.models.nodemeta;
    var Files = Modelmeta.app.models.file;
    Nodemeta.find({where: {modelId: modelId}}, function(err, nodeList) {
      if (err) { return callback(err); }
      var nodes = {};
      async.map(nodeList, function(node, callback) {
        Files.find({where: {nodeId: node.sid}}, function(err, fileList) {
          if (err) { return callback(err); }
          var files = {};
          fileList.forEach(function(file) {
            files[file.name] = file.url;
          });
          node.files = files;
          callback(null, node);
        });
      }, function(err, results) {
        if (err) { return callback(err); }
        results.forEach(function(item) {
          nodes[item.sid] = item;
        });
        callback(null, nodes);
      });
    });
  }

  Modelmeta.afterRemote('findById', function(ctx, model, next) {
    getNodeList(model.sid, function(err, nodeList) {
      if (err) {
        console.error(err);
        return next(new Error('Internal error'));
      }
      model.nodes = nodeList;
      next();
    });
  });
};
