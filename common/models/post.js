'use strict';
var assign = require('lodash/assign');
var moment = require('moment');
var async = require('async');
var P = require('bluebird');
var logger = require('winston');
var crypto = require('crypto');

var utils = require('../utils');
var S3Uploader = require('../utils/aws-wrapper').S3Uploader;
var IdGenerator = require('../utils/id-generator');

var idGen = new IdGenerator();

var gearClient;
try {
  var gearServers = process.env.G_SERVERS ? JSON.parse(process.env.G_SERVERS) : [ { host: 'localhost', port: 4730 } ];
  gearClient = require('gearmanode').client({ servers: gearServers });
  gearClient.jobServers.forEach(function(server) {
    server.setOption('exceptions', function() {});
  });
} catch (err) {
  throw new Error(err);
}

var MEDIA_PANO_PHOTO = 'panoPhoto';
var MEDIA_LIVE_PHOTO = 'livePhoto';

module.exports = function(Post) {

  var s3Uploader;
  Post.on('attached', function(app) {
    if (process.env.S3_BKT === 'MOCKUP') {
      s3Uploader = new S3Uploader({
        Bucket: process.env.S3_BKT,
        MockupBucketPath: process.env.S3_MOCKUP_BKTPATH,
        MockupServerPort: process.env.S3_MOCKUP_PORT
      });
      if (!s3Uploader.isMockupServerUp()) {
        s3Uploader.on('mockupServerStarted', function() {
          app.emit('mockupServerStarted');
        });
      }
    } else {
      s3Uploader = new S3Uploader({ Bucket: process.env.S3_BKT });
    }
  });

  // disable default remote methods
  // XXX: The way I override the default remtoe method (define a 'findPostById' method to replace default
  //      'findById' method by registering the same path '/:id') has unexpected behavior. Another way
  //      to override is to disable the orignial one and then define our own.
  //      One of the reason I do not override the 'findById' method directly is that there are other APIs or
  //      methods will still call it. Also, all I want is to override the REST API (ie., GET /posts/:id).
  //      see mamartins' comments in 'https://github.com/strongloop/loopback/issues/443' for more information.
  Post.disableRemoteMethod('findById', true);

  Post.validatesInclusionOf('mediaType', { in: [ MEDIA_PANO_PHOTO, MEDIA_LIVE_PHOTO ] });

  function getTimeNow() {
    return moment(new Date()).format('YYYY-MM-DD');
  }

  function createAsyncJob(options) {
    logger.debug('in createAsyncJob');
    var job;
    var post = {};
    var list = [];
    switch (options.jobType) {
      case 'panoPhoto': {
        logger.debug('creating async job: '+options.jobType);
        job = gearClient.submitJob('handlePanoPhoto', JSON.stringify({
          postId: options.postId,
          image: assign({}, options.image, { buffer: options.image.buffer.toString('base64') }),
          thumbnail: options.thumbnail
        }));
        job.on('complete', function() {
          logger.debug('job completed for '+options.jobType);
          var response = JSON.parse(job.response);
          Post.updateAll({ sid: response.postId }, {
            status: 'completed',
            thumbnail: {
              srcUrl: response.thumbUrl,
              downloadUrl: response.thumbDownloadUrl
            },
            media: {
              srcUrl: response.srcUrl,
              srcDownloadUrl: response.srcDownloadUrl,
              srcTiledImages: response.srcTiledImages,
              srcMobileUrl: response.srcMobileUrl,
              srcMobileDownloadUrl: response.srcMobileDownloadUrl,
              srcMobileTiledImages: response.srcMobileTiledImages
            }
          }, function(err) {
            if (err) { logger.error(err); }
            logger.debug('updated post successfully');
          });
        });
        break;
      }
      case 'livePhoto': {
        logger.debug('creating async job: '+options.jobType);
        job = gearClient.submitJob('handleLivePhoto', JSON.stringify({
          postId: options.postId,
          image: assign({}, options.image, { buffer: options.image.buffer.toString('base64') }),
          thumbnail: options.thumbnail
        }));
        job.on('complete', function() {
          logger.debug('job completed for '+options.jobType);
          var response = JSON.parse(job.response);
          Post.updateAll({ sid: response.postId }, {
            status: 'completed',
            thumbnail: {
              srcUrl: response.thumbUrl,
              downloadUrl: response.thumbDownloadUrl
            },
            media: {
              srcUrl: response.srcUrl,
              srcDownloadUrl: response.srcDownloadUrl,
              srcHighImages: response.srcHighImages,
              srcLowImages: response.srcLowImages
            }
          }, function(err) {
            if (err) { logger.error(err); }
            logger.debug('updated post successfully');
          });
        });
        break;
      }
      case 'deletePanoPhoto': {
        post = options.post;
        list = [];
        if (post.thumbnail) {
          list.push(post.thumbnail.srcUrl);
        }
        if (post.media) {
          if (post.media.srcUrl) list.push(post.media.srcUrl);
          if (post.media.srcTiledImages) {
            list = list.concat(post.media.srcTiledImages.map(function(image) { return image.srcUrl; }));
          }
          if (post.media.srcMobileUrl) list.push(post.media.srcMobileUrl);
          if (post.media.srcMobileTiledImages) {
            list = list.concat(post.media.srcMobileTiledImages.map(function(image) { return image.srcUrl; }));
          }
        }
        if (list.length !== 0) {
          job = gearClient.submitJob('deletePostImages', JSON.stringify({
            imageList: list
          }));
        }
        break;
      }
      case 'deleteLivePhoto': {
        post = options.post;
        list = [];
        if (post.thumbnail) {
          list.push(post.thumbnail.srcUrl);
        }
        if (post.media) {
          if (post.media.srcUrl) list.push(post.media.srcUrl);
          if (post.media.srcHighImages) {
            list = list.concat(post.media.srcHighImages.map(function(image) { return image.srcUrl; }));
          }
        }
        if (list.length !== 0) {
          job = gearClient.submitJob('deletePostImages', JSON.stringify({
            imageList: list
          }));
        }
        break;
      }
      default:
        return;
    }
    if (job) {
      job.on('socketError', function(serverId, e) {
        logger.error('[ %s ]: onSocketError: server: %s, error: %s', job.name, serverId, e.toString());
      });
      job.on('jobServerError', function(serverId, code, message) {
        logger.error('[ %s ]: onJobServerError: code: %s, message: %s', serverId, code, message);
      });
      job.on('error', function(e) {
        logger.error('[ %s ]: onError: %s', job.name, e.toString());
      });
      job.on('exception', function(e) {
        logger.error('[ %s ]: onException: %s', job.name, e.toString());
      });
      job.on('timeout', function() {
        logger.error('[ %s ]: job timeout', job.name);
      });
    }
    return job;
  }

  function uploadS3(params, callback) {
    var shardingKey = genShardingKey();
    try {
      var fileKey = 'posts/'+params.postId+'/'+shardingKey+'/'+params.type+'/'+params.quality+'/'+params.timestamp+'/'+params.imageFilename;
      if (!s3Uploader) {
        var error = new Error('S3 uploader is not ready yet!');
        error.status = 500;
        return callback(error);
      }
      s3Uploader.send({
        File: params.image,
        Key: fileKey,
        options: {
          ACL: 'public-read'
        }
      }, function(err, data) {
        if (err) { return callback(err); }
        var s3Filename = data.Key || data.key;
        var s3Url = data.Location;
        // TODO: use real CDN download url
        var cdnFilename = data.Key || data.key;
        var cdnUrl = data.Location;
        callback(null, {
          cdnFilename: cdnFilename,
          cdnUrl: cdnUrl,
          s3Filename: s3Filename,
          s3Url: s3Url
        });
      });
    } catch (err) {
      callback(err);
    }

    function genShardingKey() {
      var keylen = 4;
      return crypto.randomBytes(Math.ceil(keylen/2)).toString('hex');
    }
  }

  function createPost(mediaType, req, callback) {
    try {
      var caption = req.body.caption;
      var imgBuf = req.files.image[0].buffer;
      var imgType = req.files.image[0].mimetype;
      var imgWidth = req.body.width;
      var imgHeight = req.body.height;
      var imgOrientation = req.body.orientation ? req.body.orientation.trim().toLowerCase() : null;
      var imgDirection = req.body.recordDirection ? req.body.recordDirection.trim().toLowerCase() : null;
      var imgArrBoundary = req.body.imgArrBoundary || null;
      var thumbBuf = req.files.thumbnail[0].buffer;
      var thumbType = req.files.thumbnail[0].mimetype;
      var thumbLat = req.body.thumbLat || null;
      var thumbLng = req.body.thumbLng || null;
      var locationProvider = req.body.locationProvider || 'facebook';
      var locationProviderId = req.body.locationProviderId || null;
      var locationName = req.body.locationName || null;
      var locationCity = req.body.locationCity || null;
      var locationStreet = req.body.locationStreet || null;
      var locationZip = req.body.locationZip || null;
      var locationLat = req.body.locationLat || null;
      var locationLng = req.body.locationLng || null;
      var now = getTimeNow();

      if ((mediaType === MEDIA_PANO_PHOTO && (!thumbBuf || !thumbType || !thumbLat || !thumbLng)) ||
          (mediaType === MEDIA_LIVE_PHOTO && (!thumbBuf || !thumbType))) {
        return callback(new Error('Missing properties'));
      }
      if (!imgBuf || !imgType || !imgWidth || !imgHeight) {
        return callback(new Error('Missing properties'));
      }
      if (imgType !== 'application/zip') {
        return callback(new Error('Invalid image type'));
      }
      if (thumbType !== 'image/jpeg') {
        return callback(new Error('Invalid thumbnail type'));
      }

      var Location = Post.app.models.location;
      new P(function(resolve) {
        if (locationProviderId) {
          resolve(new P(function(resolve, reject) {
            Location.findOrCreate({
              where: {
                and: [
                  { provider: locationProvider },
                  { providerId: locationProviderId }
                ]
              }
            }, {
              provider: locationProvider,
              providerId: locationProviderId,
              name: locationName,
              city: locationCity,
              street: locationStreet,
              zip: locationZip,
              geo: {
                lat: locationLat,
                lng: locationLng
              }
            }, function(err, location) {
              if (err) { reject(err); }
              else { resolve(location); }
            });
          }));
        } else if (locationName) {
          resolve(new P(function(resolve, reject) {
            Location.create({
              name: locationName,
              geo: {
                lat: locationLat,
                lng: locationLng
              }
            }, function(err, location) {
              if (err) { reject(err); }
              else if (!location) {
                var error = new Error('Failed to Create Location');
                error.status = 500;
                reject(error);
              }
              else { resolve(location); }
            });
          }));
        } else {
          resolve(null);
        }
      })
      .then(function(location) {
        return new P(function(resolve, reject) {
          var dimension = {};
          var missingProperties = [];
          if (mediaType === MEDIA_PANO_PHOTO) {
            if (!thumbLat) { missingProperties.push('thumbLat'); }
            if (!thumbLng) { missingProperties.push('thumbLng'); }
            if (missingProperties.length !== 0) {
              return reject(new Error('Missing Properties: ' + missingProperties));
            }
            dimension = {
              width: imgWidth,
              height: imgHeight,
              lat: thumbLat,
              lng: thumbLng
            };
          } else if (mediaType === MEDIA_LIVE_PHOTO) {
            if (!imgOrientation) { missingProperties.push('orientation'); }
            if (!imgDirection) { missingProperties.push('direction'); }
            if (missingProperties.length !== 0) {
              return reject(new Error('Missing Properties: ' + missingProperties));
            }
            if (![ 'landscape', 'portrait' ].find(function(value) { return value === imgOrientation; })) {
              return reject(new Error('Invalid Image Orientation Value: ' + imgOrientation));
            }
            if (![ 'horizontal', 'vertical' ].find(function(value) { return value === imgDirection; })) {
              return reject(new Error('Invalid Image Direction Value: ' + imgDirection));
            }
            dimension = {
              width: imgWidth,
              height: imgHeight,
              orientation: imgOrientation,
              direction: imgDirection
            };
          }
          var postObj = {
            mediaType: mediaType,
            dimension: dimension,
            caption: caption,
            ownerId: req.accessToken.userId,
            locationId: location ? location.id : null
          };
          Post.create(postObj, function(err, post) {
            if (err) { reject(err); }
            else if (!post) {
              var error = new Error('Failed to Create Location');
              error.status = 500;
              reject(error);
            }
            else { resolve(post); }
          });
        });
      })
      .then(function(post) {
        var type;
        if (mediaType === MEDIA_PANO_PHOTO) {
          type = 'pan';
        } else if (mediaType === MEDIA_LIVE_PHOTO) {
          type = 'live';
        }
        return new P(function(resolve, reject) {
          uploadS3({
            type: type,
            quality: 'thumb',
            postId: post.id,
            timestamp: now,
            imageFilename: post.id + '.jpg',
            image: thumbBuf
          }, function(err, result) {
            if (err) { reject(err); }
            else {
              resolve({
                post: post,
                thumbnail: result
              });
            }
          });
        });
      })
      .then(function(result) {
        // create a job for worker
        var params = {
          jobType: mediaType,
          postId: result.post.sid,
          image: {
            width: imgWidth,
            height: imgHeight,
            buffer: imgBuf,
            hasZipped: true
          },
          thumbnail: {
            srcUrl: result.thumbnail.s3Url,
            downloadUrl: result.thumbnail.cdnUrl
          }
        };
        if (mediaType === MEDIA_LIVE_PHOTO) {
          if (!imgArrBoundary) {
            return P.reject(new Error('Missing properties: image array boundary'));
          }
          params.image.arrayBoundary = imgArrBoundary;
        }
        createAsyncJob(params);
        callback(null, {
          postId: result.post.id,
          thumbnailUrl: result.thumbnail.cdnUrl
        });
      })
      .catch(function(err) {
        logger.error(err);
        if (err.status && err.status >= 400 && err.status < 500) {
          callback(err);
        } else {
          callback(new Error('Internal Error'));
        }
      });
    } catch(error) {
      return callback(error);
    }
  }

  Post.createPanoPhoto = function(req, callback) {
    logger.debug('in createPanoPhoto');
    createPost(MEDIA_PANO_PHOTO, req, callback);
  };
  Post.remoteMethod('createPanoPhoto', {
    accepts: [
      { arg: 'req', type: 'object', 'http': { source: 'req' } }
    ],
    returns: [ { arg: 'result', type: 'objct' } ],
    http: { path: '/panophoto', verb: 'post' }
  });

  Post.createLivePhoto = function(req, callback) {
    logger.debug('in createLivePhoto');
    createPost(MEDIA_LIVE_PHOTO, req, callback);
  };
  Post.remoteMethod('createLivePhoto', {
    accepts: [
      { arg: 'req', type: 'object', 'http': { source: 'req' } }
    ],
    returns: [ { arg: 'result', type: 'objct' } ],
    http: { path: '/livephoto', verb: 'post' }
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

  Post.beforeRemote('deleteById', function(ctx, unused, next) {
    Post.findById(ctx.req.params.id, function(err, post) {
      if (err) { return next(err); }
      if (!post) {
        var error = new Error('Post Not Found');
        error.status = 404;
        return next(error);
      }
      switch (post.mediaType) {
        case 'panoPhoto':
          createAsyncJob({ jobType: 'deletePanoPhoto', post: post });
          break;
        case 'livePhoto':
          createAsyncJob({ jobType: 'deleteLivePhoto', post: post });
          break;
        default:
          break;
      }
      next();
    });
  });

  Post.findPostById = function(id, req, callback) {
    logger.debug('in findPostById');
    Post.findById(id, {
      include: [
        {
          relation: 'owner',
          scope: {
            fields: [ 'username', 'profilePhotoUrl' ],
            include: {
              relation: 'identities',
              scope: {
                fields: [ 'provider', 'profile' ]
              }
            }
          }
        },
        {
          relation: '_likes_',
          scope: {
            fields: [ 'userId' ]
          }
        },
        {
          relation: 'location',
          scope: {
            fields: [ 'name', 'geo', 'city', 'street', 'zip' ]
          }
        }
      ]
    }, function(err, post) {
      if (err) { return callback(err); }
      if (!post) {
        var error = new Error('Post Not Found');
        error.status = 404;
        return callback(error);
      }
      var postObj = post.toJSON();
      postObj.likes = utils.formatLikeList(postObj['_likes_'], req.accessToken ? req.accessToken.userId : null);
      delete postObj['_likes_'];
      callback(null, postObj);
    });
  };
  Post.remoteMethod('findPostById', {
    accepts: [
      { arg: 'id', type: 'string', require: true },
      { arg: 'req', type: 'object', 'http': { source: 'req' } }
    ],
    returns: [ { arg: 'result', type: 'object' } ],
    http: { path: '/:id', verb: 'get' }
  });

  Post.like = function(postId, req, res, callback) {
    Post.findById(postId, function(err, post) {
      if (err) {
        logger.error(err);
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
        logger.error(err);
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

  Post.getLikeList = function(postId, req, callback) {
    var Like = Post.app.models.like;
    Like.find({
      where: { postId: postId },
      fields: [ 'userId', 'likeAt' ],
      include: {
        relation: 'user',
        scope: {
          fields: [ 'username', 'profilePhotoUrl' ],
          include: [
            {
              relation: 'followers',
              scope: {
                where: { followerId: req.accessToken.userId }
              }
            },
            {
              relation: 'identities',
              scope: {
                fields: [ 'provider', 'profile' ]
              }
            }
          ]
        }
      }
    }, function(err, likes) {
      if (err) {
        logger.error(err);
        return callback(err);
      }
      var output = [];
      likes.forEach(function(like) {
        var likeObj = like.toJSON();
        likeObj.isFollowing = false;
        if (likeObj.user.followers.length !== 0) {
          likeObj.isFollowing = true;
        }
        delete likeObj.user.followers;
        output.push(likeObj);
      });
      callback(null, output);
    });
  };
  Post.remoteMethod('getLikeList', {
    accepts: [
      { arg: 'id', type: 'string', require: true },
      { arg: 'req', type: 'object', 'http': { source: 'req' } }
    ],
    returns: [ { arg: 'result', type: 'object' } ],
    http: { path: '/:id/likes', verb: 'get' }
  });
};
