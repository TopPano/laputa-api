'use strict';
var assert = require('assert');
var moment = require('moment');
var gm = require('gm');
var async = require('async');
var fs = require('fs');

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

  function upload(params, callback) {
    var shardingKey = 'beef';
    var path = './server/test/data/images/models/'+params.modelId+'/'+shardingKey+'/'+params.type+'/'+params.quality+'/'+params.timestamp;
    createDir(path, function(err) {
      if (err) { return callback(err); }
      fs.writeFile(path+'/'+params.imageFilename, params.image, function(err) {
        if (err) { return callback(err); }
        var cdnFilename = '/'+params.type+'/'+params.quality+'/'+params.imageFilename;
        var cdnUrl = 'http://localhost:3000/images/models/'+params.modelId+'/'+shardingKey+'/'+params.type+'/'+params.quality+'/'+params.timestamp+'/'+params.imageFilename;
        // TODO: use real S3 download url
        var s3Filename = cdnFilename;
        var s3Url = cdnUrl;
        callback(null, cdnFilename, cdnUrl, s3Filename, s3Url);
      });
    });
  }

  Modelmeta.beforeRemote('*.__create__nodes', function(ctx, instance, next) {
    // Property checking
    try {
      var imgBuf = ctx.req.files.image[0].buffer;
      var imgType = ctx.req.files.image[0].mimetype;
      var imgWidth = ctx.req.body.width;
      var imgHeight = ctx.req.body.height;
      var thumbBuf = ctx.req.files.thumbnail[0].buffer;
      var thumbType = ctx.req.files.thumbnail[0].mimetype;

      if (!imgBuf || !imgType || !imgWidth || !imgHeight ||
          !thumbBuf || !thumbType) {
        return next(new Error('Missing properties'));
      }
      if (imgType !== 'image/jpeg' || thumbType !== 'image/jpeg') {
        return next(new Error('Invalid image type'));
      }
      next();
    } catch (err) {
      console.error(err);
      next(new Error('Invalid request'));
    }
  });

  Modelmeta.afterRemote('*.__create__nodes', function(ctx, instance, next) {

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

    try {
      var modelId = ctx.req.params.id;
      var nodeId = ctx.result.sid;
      var imgBuf = ctx.req.files.image[0].buffer;
      var imgWidth = ctx.req.body.width;
      var imgHeight = ctx.req.body.height;
      var thumbBuf = ctx.req.files.thumbnail[0].buffer;
      var thumbType = ctx.req.files.thumbnail[0].mimetype;
      var now = getTimeNow();

      async.parallel({
        uploadThumb: function(callback) {
          upload({
            type: 'pan',
            quality: 'thumb',
            modelId: modelId,
            timestamp: now,
            imageFilename: nodeId+'.jpg',
            image: thumbBuf
          }, function(err, cdnFilename, cdnUrl, s3Filename, s3Url) {
            if (err) { return callback(err); }
            instance.thumbnailUrl = s3Url;
            callback();
          });
        },
        uploadImage: function(callback) {
          upload({
            type: 'pan',
            quality: 'src',
            modelId: modelId,
            timestamp: now,
            imageFilename: nodeId+'.jpg',
            image: thumbBuf
          }, function(err, cdnFilename, cdnUrl, s3Filename, s3Url) {
            if (err) { return callback(err); }
            instance.srcUrl = s3Url;
            instance.srcDownloadUrl = cdnUrl;
            instance.files.create({
              name: cdnFilename,
              url: cdnUrl,
              modelId: modelId
            }, function(err) {
              if (err) { return callback(err); }
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
                instance.files.create({
                  name: cdnFilename,
                  url: cdnUrl,
                  modelId: modelId
                }, function(err) {
                  if (err) { return callback(err); }
                  callback();
                });
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
                    instance.files.create({
                      name: cdnFilename,
                      url: cdnUrl,
                      modelId: modelId
                    }, function(err) {
                      if (err) { return callback(err); }
                      callback();
                    });
                  });
                });
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

  Modelmeta.beforeRemote('*.__create__snapshots', function(ctx, instance, next) {
    try {
      var image = ctx.req.files.image[0].buffer;
      var type = ctx.req.files.image[0].mimetype;

      if (!image || (image.length === 0) || !type) {
        return next(new Error('Missing properties'));
      }
      if (type !== 'image/jpeg' && type !== 'image/jpg') {
        return next(new Error('Invalid image type'));
      }
      next();
    } catch (err) {
      console.error(err);
      next(new Error('Invalid request'));
    }
  });

  Modelmeta.afterRemote('*.__create__snapshots', function(ctx, instance, next) {
    try {
      var modelId = ctx.req.params.id;
      var snapshotId = ctx.result.sid;
      var image = ctx.req.files.image[0].buffer;

      upload({
        type: 'pic',
        quality: 'src',
        modelId: modelId,
        timestamp: getTimeNow(),
        imageFilename: snapshotId+'.jpg',
        image: image
      }, function(err, cdnFilename, cdnUrl, s3Filename, s3Url) {
        if (err) { return next(new Error('Invalid image type')); }
        instance.url = s3Url;
        instance.downloadUrl = cdnUrl;
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
    Nodemeta.find({
      modelId: modelId
    }, function(err, nodeList) {
      if (err) { return callback(err); }
      var nodes = {};
      nodeList.forEach(function(node) {
        nodes[node.sid] = node;
      });
      callback(null, nodes);
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

  Modelmeta.afterRemote('find', function(ctx, models, next) {
    async.map(models, function(model, callback) {
      getNodeList(model.sid, function(err, nodeList) {
        if (err) { return callback(err); }
        model.nodes = nodeList;
        callback();
      });
    }, function(err) {
      if (err) {
        console.error(err);
        return next(new Error('Internal error'));
      }
      next();
    });
  });
};
