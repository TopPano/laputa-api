'use strict';
var assert = require('assert');
//var zlib = require('zlib');
var moment = require('moment');
//var gm = require('gm');
var async = require('async');
var crypto = require('crypto');
var S3Uploader = require('../utils/S3Uploader');
var VerpixId = require('../utils/verpix-id-gen');
var idGen = new VerpixId();
var gearmanode = require('gearmanode');
var gearClient = gearmanode.client();

module.exports = function(Post) {

  function getTimeNow() {
    return moment(new Date()).format('YYYY-MM-DD');
  }

  function genShardingKey() {
    var keylen = 4;
    return crypto.randomBytes(Math.ceil(keylen/2)).toString('hex');
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

  /*
  function processImage(params, callback) {
    var now = getTimeNow();

    async.parallel({
      uploadThumb: function(callback) {
        var croppedWidth = params.width / 2;
        var croppedHeight = params.height / 2;
        var croppedPositionX = params.width / 4;
        var croppedPositionY = params.height / 4;
        gm(params.image)
        .crop(croppedWidth, croppedHeight, croppedPositionX, croppedPositionY)
        .resize(300, 150)
        .toBuffer('JPG', function(err, buffer) {
          if (err) { return callback(err); }
          upload({
            type: 'pan',
            quality: 'thumb',
            postId: params.postId,
            timestamp: now,
            imageFilename: params.nodeId+'.jpg',
            image: buffer
          }, function(err, cdnFilename, cdnUrl, s3Filename, s3Url) {
            if (err) { return callback(err); }
            //ctx.args.data.thumbnailUrl = s3Url;
            callback(null, s3Url);
          });
        });
      },
      tileImgHigh: function(callback) {
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
            }, function(err, cdnFilename, cdnUrl) {
              if (err) { return callback(err); }
              //ctx.nodeFiles.push({
              files.push({
                name: cdnFilename,
                url: cdnUrl,
                postId: params.postId
              });
              callback();
            });
          });
        }, function(err) {
          if (err) { return callback(err); }
          callback(null, files);
        });
      },
      tileImgLow: function(callback) {
        gm(params.image)
        .resize(4096, 2048)
        .toBuffer('JPG', function(err, buffer) {
          if (err) { return callback(err); }
          async.parallel({
            resizedImg: function(callback) {
              upload({
                type: 'pan',
                quality: 'src',
                postId: params.postId,
                timestamp: now,
                imageFilename: params.nodeId+'_low.jpg',
                image: buffer
              }, function(err, cdnFilename, cdnUrl, s3Filename, s3Url) {
                if (err) { return callback(err); }
                //ctx.args.data.srcMobileUrl = s3Url;
                //ctx.args.data.srcMobileDownloadUrl = cdnUrl;
                callback(null, { srcMobileUrl: s3Url, srcMobileDownloadUrl: cdnUrl });
              });
            },
            tiledResizedImg: function(callback) {
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
                  }, function(err, cdnFilename, cdnUrl) {
                    if (err) { return callback(err); }
                    //ctx.nodeFiles.push({
                    files.push({
                      name: cdnFilename,
                      url: cdnUrl,
                      postId: params.postId
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
  */

  Post.beforeRemote('*.__create__nodes', function(ctx, instance, next) {

    try {
      var postId = ctx.req.params.id;
      var nodeId = ctx.args.data.sid;
      var imgBuf = ctx.req.files.image[0].buffer;
      var imgType = ctx.req.files.image[0].mimetype;
      var imgWidth = ctx.req.body.width;
      var imgHeight = ctx.req.body.height;
      var imgIndex = ctx.req.body.index;
      var thumbBuf = ctx.req.files.thumbnail[0].buffer;
      var thumbType = ctx.req.files.thumbnail[0].mimetype;
      var thumbLat = ctx.req.body.thumbLat;
      var thumbLng = ctx.req.body.thumbLng;
      var now = getTimeNow();

      if (!thumbBuf || !thumbType || !thumbLat || !thumbLng) {
        return next(new Error('Missing properties'));
      }
      if (!imgBuf || !imgType || !imgWidth || !imgHeight) {
        return next(new Error('Missing properties'));
      }
      if (imgType !== 'application/zip') {
        return next(new Error('Invalid image type'));
      }

      async.parallel({
        srcImg: function(callback) {
          upload({
            type: 'pan',
            quality: 'src',
            postId: postId,
            timestamp: now,
            imageFilename: nodeId+'.jpg',
            image: imgBuf
          }, callback);
        },
        thumbnail: function(callback) {
          upload({
            type: 'pan',
            quality: 'thumb',
            postId: postId,
            timestamp: now,
            imageFilename: nodeId+'.jpg',
            image: thumbBuf
          }, callback);
        }
      }, function(err, results) {
        if (err) {
          // TODO: we might want to rollback any success upload if there is an error occured,
          //       we could either do the rollback here or have another program to clean up
          //       the dangling uploaded images.
          //       I prefer the latter solution, the former one would make the error handling
          //       process too complicated to maintain.
          console.error(err);
          return next(err);
        }
        ctx.args.data.thumbnailUrl = results.thumbnail.s3Url;
        ctx.args.data.srcUrl = results.srcImg.s3Url;
        ctx.args.data.srcDownloadUrl = results.srcImg.cdnUrl;
        ctx.args.data.lat = thumbLat;
        ctx.args.data.lng = thumbLng;
        if (imgIndex === 1) {
          Post.updateAll({sid: postId}, {thumbnailUrl: results.thumbnail.s3Url}, function(err) {
            if (err) { return next(err); }
            next();
          });
        } else {
          next();
        }
      });

      /*
      var nodeFiles = [];

      zlib.inflate(imgBuf, function(err, uzImgBuf) {
        if (err) {
          console.error(err);
          return next(new Error('Internal error'));
        }
        upload({
          type: 'pan',
          quality: 'src',
          postId: postId,
          timestamp: now,
          imageFilename: nodeId+'.jpg',
          image: uzImgBuf
        }, function(err, cdnFilename, cdnUrl, s3Filename, s3Url) {
          if (err) {
            console.error(err);
            return next(new Error('Internal error'));
          }
          ctx.args.data.srcUrl = s3Url;
          ctx.args.data.srcDownloadUrl = cdnUrl;
          nodeFiles.push({
            name: cdnFilename,
            url: cdnUrl,
            postId: postId
          });
          // TODO: separate image processing from api to another process or service
          processImage({
            width: imgWidth,
            height: imgHeight,
            image: uzImgBuf,
            postId: postId,
            nodeId: nodeId
          }, function(err, results) {
            if (err) {
              console.error(err);
              return next(new Error('Internal error'));
            }
            ctx.args.data.thumbnailUrl = results.uploadThumb;
            ctx.args.data.srcMobileUrl = results.tileImgLow.resizedImg.srcMobileUrl;
            ctx.args.data.srcMobileDownloadUrl = results.tileImgLow.resizedImg.srcMobileDownloadUrl;
            ctx.nodeFiles = nodeFiles.concat(results.tileImgHigh, results.tileImgLow.tiledResizedImg);
            if (imgIndex === '1') {
              Post.findById(postId, function(err, post) {
                if (err) {
                  console.error(err);
                  return next(new Error('Internal error'));
                }
                post.updateAttributes({thumbnailUrl: results.uploadThumb}, function(err) {
                  if (err) {
                    console.error(err);
                    return next(new Error('Internal error'));
                  }
                  next();
                });
              });
            } else {
              next();
            }
          });
        });
      });
      */
    } catch (err) {
      console.error(err);
      next(new Error('Invalid request'));
    }
  });

  Post.afterRemote('*.__create__nodes', function(ctx, instance, next) {
    var job = gearClient.submitJob('process image', JSON.stringify({
      postId: ctx.req.params.id,
      nodeId: ctx.args.data.sid,
      image: {
        width: ctx.req.body.width,
        height: ctx.req.body.height,
        buffer: ctx.req.files.image[0].buffer.toString('base64'),
        hasZipped: ctx.req.files.image[0].mimetype === 'application/zip' ? true : false
      }
    }));
    job.on('complete', function() {
      console.log('response: '+job.response);
      var response = JSON.parse(job.response);
      if (response.status !== 'success') {
        // TODO: retry!!
        return console.error('Failed to process image!!');
      }
      if (!response.srcMobileUrl || !response.srcMobileDownloadUrl || !response.files) {
        return console.error('Failed to process image!!');
      }
      var Nodemeta = Post.app.models.nodemeta;
      var File = Post.app.models.file;
      // at the time the function being called, Nodemeta and File should already be loaded
      assert(Nodemeta);
      assert(File);
      async.parallel({
        saveNodemeta: function(callback) {
          Nodemeta.updateAll({sid: response.nodeId}, {
            srcMobileUrl: response.srcMobileUrl,
            srcMobileDownloadUrl: response.srcMobileDownloadUrl
          }, function(err) {
            if (err) { return callback(err); }
            callback();
          });
        },
        saveNodeFiles: function(callback) {
          async.each(response.files, function(file, callback) {
            File.create(file, function(err) {
              if (err) { return callback(err); }
              callback();
            });
          }, function(err) {
            if (err) { return callback(err); }
            callback();
          });
        }
      }, function(err) {
        if (err) { console.error(err); }
        gearClient.close();
      });
    });
    next();
    /*
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
    */
  });

  /*
  Post.nodeCreateCallback = function(postId, nodeId, json, callback) {
    console.log('create node callback %s %s', postId, nodeId);
    console.log(JSON.stringify(json));
    if (json.status !== 'success') {
      // TODO: retry!!
      console.error('Failed to process image!!');
      return callback(null, null);
    }
    var response = json.response;
    if (!response.srcMobileUrl || !response.srcMobileDownloadUrl || !response.files) {
      console.error('Failed to process image!!');
      return callback(null, null);
    }
    var Nodemeta = Post.app.models.nodemeta;
    var File = Post.app.models.file;
    async.parallel({
      saveNodemeta: function(callback) {
        Nodemeta.updateAll({sid: nodeId}, {
          srcMobileUrl: response.srcMobileUrl,
          srcMobileDownloadUrl: response.srcMobileDownloadUrl
        }, function(err) {
          if (err) { return callback(err); }
          callback();
        });
      },
      saveNodeFiles: function(callback) {
        async.each(response.files, function(file, callback) {
          File.create(file, function(err) {
            if (err) { return callback(err); }
            callback();
          });
        }, function(err) {
          if (err) { return callback(err); }
          callback();
        });
      }
    }, function(err) {
      if (err) { return callback(err); }
      callback(null, null);
    });
  };
  Post.remoteMethod('nodeCreateCallback', {
    accepts: [
      { arg: 'id', type: 'string', require: true },
      { arg: 'nodeId', type: 'string', require: true },
      { arg: 'json', type: 'object', http: { source: 'body' } }
    ],
    http: { path: '/:id/nodes/:nodeId/callback', verb: 'post' }
  });
  */

  Post.beforeRemote('*.__create__snapshots', function(ctx, instance, next) {
    try {
      var postId = ctx.req.params.id;
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
        postId: postId,
        timestamp: getTimeNow(),
        imageFilename: ctx.args.data.sid+'.jpg',
        image: image
      }, function(err, result) {
        if (err) { return next(new Error('Invalid image type')); }
        ctx.args.data.url = result.s3Url;
        ctx.args.data.downloadUrl = result.cdnUrl;
        next();
      });
    } catch (err) {
      console.error(err);
      next(new Error('Invalid request'));
    }
  });

  Post.afterRemote('*.__get__files', function(ctx, instance, next) {
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

  Post.observe('before save', function(ctx, next) {
    if (ctx.instance && ctx.isNewInstance) {
      // on create
      idGen.next(function(err, id) {
        if (err) { return next(err); }
        ctx.instance.sid = id.id;
        ctx.instance.created = id.timestamp;
        ctx.instance.modified = id.timestamp;
        next();
      });
    } else {
      // on update
      ctx.data.modified = new Date();
      next();
    }
  });

  function getNodeList(postId, callback) {
    var Nodemeta = Post.app.models.nodemeta;
    var Files = Post.app.models.file;
    Nodemeta.find({where: {postId: postId}}, function(err, nodeList) {
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

  Post.afterRemote('findById', function(ctx, post, next) {
    var Like = Post.app.models.like;
    var User = Post.app.models.user;
    if (!post) {
      var error = new Error('No post found');
      error.status = 404;
      return next(error);
    }
    async.parallel({
      nodes: function(callback) {
        getNodeList(post.sid, function(err, list) {
          if (err) { return callback(err); }
          callback(null, list);
        });
      },
      likeCount: function(callback) {
        Like.find({where: {postId: post.sid}}, function(err, list) {
          if (err) { return callback(err); }
          callback(null, list.length);
        });
      },
      isLiked: function(callback) {
        if (ctx.req.accessToken) {
          User.findById(ctx.req.accessToken.userId, function(err, profile) {
            if (err) { return callback(err); }
            if (!profile) { return callback(new Error('No user with this access token was found.')); }
            Like.find({where: {postId: post.sid, userId: ctx.req.accessToken.userId}}, function(err, list) {
              if (err) { return callback(err); }
              if (list.length !== 0) { callback(null, true); }
              else { callback(null, false); }
            });
          });
        } else {
          callback(null, false);
        }
      },
      ownerInfo: function(callback) {
        var User = Post.app.models.user;
        User.findById(post.ownerId, function(err, user) {
          if (err) { return callback(err); }
          if (!user) {
            var error = new Error('Internal Error');
            error.status = 500;
            return callback(error);
          }
          callback(null, {
            username: user.username,
            profilePhotoUrl: user.profilePhotoUrl
          });
        });
      }
    }, function(err, results) {
      if (err) {
        console.error(err);
        return next(new Error('Internal Error'));
      }
      post.nodes = results.nodes;
      post.likes = {
        count: results.likeCount,
        isLiked: results.isLiked
      };
      post.ownerInfo = results.ownerInfo;
      next();
    });
  });

  Post.like = function(postId, req, res, callback) {
    Post.findById(postId, function(err, post) {
      if (err) {
        console.error(err);
        return callback(err);
      }
      if (!post) {
        res.status(404);
        return callback('Post Not Found');
      }
      if (!req.body.hasOwnProperty('userId')) {
        var error = new Error('Missing property: userId');
        error.status = 400;
        return callback(error);
      }
      var userId = req.body.userId;
      var Like = Post.app.models.like;
      // Check if it is a duplicate like
      // FIXME: We should use composite id here instead of checking for duplicate entry
      //        by ourselves, however, loopback's datasource juggler has an issue for
      //        using composite id, so this is a temporary workaround until the issue
      //        is resovled.
      //
      //        Tracking issues:
      //          https://github.com/strongloop/loopback-datasource-juggler/issues/121
      //          https://github.com/strongloop/loopback-datasource-juggler/issues/478
      Like.find({where: {postId: postId, userId: userId}}, function(err, result) {
        if (err) { return callback(err); }
        if (result.length === 0) {
          Like.create({postId: postId, userId: userId}, function(err) {
            if (err) { return callback(err); }
            callback(null, 'success');
          });
        } else {
          // Ignre duplicate like
          callback(null, 'success');
        }
      });
    });
  };
  Post.remoteMethod('like', {
    accepts: [
      { arg: 'id', type: 'string', require: true },
      { arg: 'req', type: 'object', 'http': {source: 'req'} },
      { arg: 'res', type: 'object', 'http': {source: 'res'} }
    ],
    returns: [ { arg: 'status', type: 'string' } ],
    http: { path: '/:id/like', verb: 'post' }
  });

  Post.unlike = function(postId, req, res, callback) {
    Post.findById(postId, function(err, post) {
      if (err) {
        console.error(err);
        return callback(err);
      }
      if (!post) {
        res.status(404);
        return callback('Post Not Found');
      }
      if (!req.body.hasOwnProperty('userId')) {
        var error = new Error('Missing property: userId');
        error.status = 400;
        return callback(error);
      }
      var userId = req.body.userId;
      var Like = Post.app.models.like;
      Like.destroyAll({postId: postId, userId: userId}, function(err) {
        if (err) { return callback(err); }
        callback(null, 'success');
      });
    });
  };
  Post.remoteMethod('unlike', {
    accepts: [
      { arg: 'id', type: 'string', require: true },
      { arg: 'req', type: 'object', 'http': {source: 'req'} },
      { arg: 'res', type: 'object', 'http': {source: 'res'} }
    ],
    returns: [ { arg: 'status', type: 'string' } ],
    http: { path: '/:id/unlike', verb: 'post' }
  });
};
