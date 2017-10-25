'use strict';
var moment = require('moment');
var async = require('async');
var P = require('bluebird');
var logger = require('winston');
var createError = require('../utils/http-errors');
var utils = require('../utils');

var IdGenerator = require('../utils/id-generator');
var idGen = new IdGenerator();

var GearClient = require('../utils/gearman-client');
var gearClient = GearClient.factory({ servers: process.env.G_SERVERS ? JSON.parse(process.env.G_SERVERS) : null });

var crypto = require('crypto');

var MEDIA_PANO_PHOTO = 'panoPhoto';
var MEDIA_LIVE_PHOTO = 'livePhoto';

var DEFAULT_POST_SHARDING_LENGTH = 4;

function genSharding(length) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex');
}

module.exports = function(Media) {
  // disable default remote methods
  // XXX: The way I override the default remtoe method (define a 'findMediaById' method to replace default
  //      'findById' method by registering the same path '/:id') has unexpected behavior. Another way
  //      to override is to disable the orignial one and then define our own.
  //      One of the reason I do not override the 'findById' method directly is that there are other APIs or
  //      methods will still call it. Also, all I want is to override the REST API (ie., GET /media/:id).
  //      see mamartins' comments in 'https://github.com/strongloop/loopback/issues/443' for more information.
  Media.disableRemoteMethod('findById', true);

  Media.validatesInclusionOf('type', { in: [ MEDIA_PANO_PHOTO, MEDIA_LIVE_PHOTO ] });

  function createMediaForeground(mediaType, req, callback) {
    try {
      if (!req.body || !req.files) {
        return callback(new createError.BadRequest('missing properties'));
      }

      /* image */
      var imgBuf = req.files.image[0].buffer;
      var imgType = req.files.image[0].mimetype;
      var imgWidth = req.body.width;
      var imgHeight = req.body.height;
      var imgOrientation = req.body.orientation ? req.body.orientation.trim().toLowerCase() : null;
      var imgAction = req.body.action ? req.body.action.trim().toLowerCase() : null;
      var imgArrBoundary = req.body.imgArrBoundary;

      if (!imgBuf || !imgType || !imgWidth || !imgHeight) {
        return callback(new createError.BadRequest('missing properties'));
      }
      if (![ 'application/zip', 'image/jpeg' ].find(function(value) { return value === imgType; })) {
        return callback(new createError.BadRequest(
          'invalid image type'
        ));
      }
      if (mediaType === MEDIA_LIVE_PHOTO) {
        if (!imgOrientation || !imgAction || !imgArrBoundary) {
          return callback(new createError.BadRequest(
            'missing properties'
          ));
        }
        if (![ 'landscape', 'portrait' ].find(function(value) { return value === imgOrientation; })) {
          return callback(new createError.BadRequest(
            'invalid orientation value'
          ));
        }
        if (![ 'horizontal', 'vertical' ].find(function(value) { return value === imgAction; })) {
          return callback(new createError.BadRequest(
            'invalid action value'
          ));
        }
      }

      /* thumbnail */
      var thumbBuf = req.files.thumbnail[0].buffer;
      var thumbType = req.files.thumbnail[0].mimetype;
      var thumbLat = req.body.lat;
      var thumbLng = req.body.lng;

      if (!thumbBuf || !thumbType) {
        return callback(new createError.BadRequest('missing properties'));
      }
      if (thumbType !== 'image/jpeg') {
        return callback(new createError.BadRequest('invalid thumbnail type'));
      }
      if ((mediaType === MEDIA_PANO_PHOTO && (!thumbLat || !thumbLng))) {
        return callback(new createError.BadRequest('missing properties'));
      }

      /* caption */
      var caption = req.body.caption ? req.body.caption : '';

      /* title */ 
      var title = req.body.title ? req.body.title : '';  

      /* location */
      var locationProvider = req.body.locationProvider || 'facebook';
      var locationProviderId = req.body.locationProviderId;
      var locationName = req.body.locationName;
      var locationCity = req.body.locationCity;
      var locationStreet = req.body.locationStreet;
      var locationZip = req.body.locationZip;
      var locationLat = req.body.locationLat;
      var locationLng = req.body.locationLng;

      /* share */
      // XXX: Both query string and headers have a limit on the length
      //      (the limit is not specified in the spec but enforced by
      //      the browser implementation), however, the limit of headers
      //      is higher than the query string, so we use headers to
      //      carry the token.
      //
      //      see:
      //      https://boutell.com/newfaq/misc/urllength.html
      //      http://stackoverflow.com/questions/686217/maximum-on-http-header-values
      var share = [];
      if (req.get('Share-Facebook')) {
        share.push({
          name: 'facebook',
          accessToken: req.get('Share-Facebook')
        });
      }
      if (req.get('Share-Twitter')) {
        share.push({
          name: 'twitter',
          accessToken: req.get('Share-Twitter')
        });
      }

      var Location = Media.app.models.location;
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
                logger.error('Failed to create location');
                reject(new createError.InternalServerError());
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
            dimension = {
              width: imgWidth,
              height: imgHeight,
              lat: thumbLat,
              lng: thumbLng
            };
          } else if (mediaType === MEDIA_LIVE_PHOTO) {
            dimension = {
              width: imgWidth,
              height: imgHeight,
              orientation: imgOrientation,
              action: imgAction
            };
          }
          var mediaObj = {
            type: mediaType,
            dimension: dimension,
            title: title,  
            caption: caption,
            ownerId: req.accessToken.userId,
            tags: [],
            locationId: location ? location.id : null
          };
          Media.create(mediaObj, function(err, media) {
            if (err) { reject(err); }
            else if (!media) {
              logger.error('Failed to create location');
              reject(new createError.InternalServerError());
            }
            else { resolve(media); }
          });
        });
      })
      .then(function(media) {
        var params = {
          type: mediaType,
          mediaId: media.id,
          image: {
            width: imgWidth,
            height: imgHeight,
            buffer: imgBuf.toString('base64'),
            hasZipped: imgType === 'application/zip' ? true : false
          },
          thumbnail: {
            buffer: thumbBuf.toString('base64')
          },
          share: share
        };
        if (mediaType === MEDIA_LIVE_PHOTO) {
          params.image.imgArrBoundary = imgArrBoundary;
        }

        //-- gen sharding key --
        var shardingKey = genSharding(DEFAULT_POST_SHARDING_LENGTH);
        params.shardingKey = shardingKey;

        createMediaBackground(params);
        callback(null, {
          mediaId: media.id
        });
      })
      .catch(function(err) {
        logger.error(err);
        if (err.status && err.status >= 400 && err.status < 500) {
          callback(err);
        } else {
          callback(new createError.InternalServerError());
        }
      });
    } catch(error) {
      return callback(error);
    }
  }

  function createMediaBackground(params) {
    var jobName;
    if      (params.type === MEDIA_PANO_PHOTO) { jobName = 'mediaProcessingPanoPhoto'; }
    else if (params.type === MEDIA_LIVE_PHOTO) { jobName = 'mediaProcessingLivePhoto'; }
    gearClient.submitJob(jobName, params, function(err, result) {
      if (err) {
        logger.error(err);
        Media.updateAll({ sid: params.mediaId }, {
          status: 'failed'
        }, function(err) {
          if (err) { logger.error(err); }
        });
      } else {
        var content;
        var bucketName = Media.app.get('bucketName');
        var storeUrl = 'https://'+bucketName+'.s3.amazonaws.com/';
        var cdnUrl = Media.app.get('cdnUrl')? Media.app.get('cdnUrl'): 'undefined';

        if (result.type === MEDIA_PANO_PHOTO) {
          content = {
            shardingKey: params.shardingKey,  
            storeUrl: storeUrl,  
            cdnUrl: cdnUrl,
            quality: result.quality,
            project: 'equirectangular', 
          };
        } else if (result.type === MEDIA_LIVE_PHOTO) {
          content = {
            shardingKey: params.shardingKey,
            storeUrl: storeUrl,
            cdnUrl: cdnUrl,
            quality: result.quality,
            count: result.count,
            imgArrBoundary: params.image.imgArrBoundary
          };
        } else {
          return logger.error(new Error('Caught invalid media type response: id: ' + params.mediaId));
        }
        Media.updateAll({ sid: params.mediaId }, {
          status: 'completed',
          content: content
        }, function(err) {
          if (err) { return logger.error(err); }

          /* share */
          if (params.share.length !== 0) {
            params.share.forEach(function(target) {
              var jobName = target.name;
              gearClient.submitJob(jobName, {
                mediaId: params.mediaId,
                accessToken: target.accessToken
              }, function(err) {
                if (err) { logger.error(err); }
              });
            });
          }
        });
      }
    });
  }

  Media.createPanoPhoto = function(req, callback) {
    logger.debug('in createPanoPhoto');
    createMediaForeground(MEDIA_PANO_PHOTO, req, callback);
  };
  Media.remoteMethod('createPanoPhoto', {
    accepts: [
      { arg: 'req', type: 'object', 'http': { source: 'req' } }
    ],
    returns: [ { arg: 'result', type: 'object' } ],
    http: { path: '/panophoto', verb: 'post' }
  });


  Media.createLivePhoto = function(req, callback) {
    logger.debug('in createLivePhoto');
    createMediaForeground(MEDIA_LIVE_PHOTO, req, callback);
  };
  Media.remoteMethod('createLivePhoto', {
    accepts: [
      { arg: 'req', type: 'object', 'http': { source: 'req' } }
    ],
    returns: [ { arg: 'result', type: 'object' } ],
    http: { path: '/livephoto', verb: 'post' }
  });


  function createVideoBackground(mediaObj) {
    var jobName;

    if (mediaObj.type === MEDIA_LIVE_PHOTO) { jobName = 'convertImgsToVideo'; }
    if (jobName) {
      gearClient.submitJob(jobName, mediaObj, function(err, result) {
        if (err) {
          logger.error(err);
          mediaObj.content.videoStatus = 'failed';
          Media.updateAll({ sid: mediaObj.sid }, {
            content: mediaObj.content
          }, function(err) {
             if (err) { logger.error(err); }
          });
        } 
        else {  
          if (result.status === 'success' && result.videoType) {
            mediaObj.content.videoStatus = 'completed';  
            mediaObj.content.videoType = result.videoType;
          } 
          else if (result.status) {
            mediaObj.content.videoStatus = result.status;
          } 
          else {
            mediaObj.content.videoStatus = 'failed';
          } 

          Media.updateAll({ sid: mediaObj.sid }, {
            content: mediaObj.content
          }, function(err) {
            if (err) { return logger.error(err); }
          });
        } 
      }); 
    } 
  }

  Media.createVideo = function(id, req, callback) {
    logger.debug('in shareLivePhotoOnFb');
    
    // check if the media existed and then get the metadata  
    Media.findById(id, function(err, media) {
      if (err) {
        logger.error(err);
        return callback(new createError.InternalServerError());
      }
      if (!( media && media.status === 'completed' )) {
        return callback(new createError.NotFound('media not found'));
      }

      var mediaObj = media.toJSON();
      var result;
      // check if the livephoto has converted and stored as a video
      if (mediaObj.content.videoStatus) {
        result = { videoStatus: mediaObj.content.videoStatus };  
        if (mediaObj.content.videoType) {
          result.videoType = mediaObj.content.videoType;
        }
        return callback(null, result);
      }
      else {
        // if no, push converting job to verpix-async
        createVideoBackground(mediaObj);
        mediaObj.content.videoStatus = 'pending';
        Media.updateAll({ sid: id }, {
          content: mediaObj.content
        }, function(err) {
          if (err) { return logger.error(err); }
        });
        result = { videoStatus: 'pending' };
        return callback(null, result);
      }
    });
  };

  Media.remoteMethod('createVideo', {
    accepts: [
      { arg: 'id', type: 'string', required: true },
      { arg: 'req', type: 'object', 'http': { source: 'req' } }
    ],
    returns: [ { arg: 'result', type: 'object' } ],
    http: { path: '/:id/video', verb: 'post' }
  });


  Media.getVideo = function(id, req, callback) {
    logger.debug('in shareLivePhotoOnFb');
    // check if the media existed and then get the metadata  
    Media.findById(id, function(err, media) {
      if (err) {
        logger.error(err);
        return callback(new createError.InternalServerError());
      }
      if (!( media && media.status === 'completed' )) {
        return callback(new createError.NotFound('media not found'));
      }
      var mediaObj = media.toJSON();
      var result;
      // check if the livephoto has converted and stored as a video
      if (mediaObj.content.videoStatus) {
        result = { videoStatus: mediaObj.content.videoStatus };  
        if (mediaObj.content.videoStatus === 'completed' && mediaObj.content.videoType) {
          result.videoType = mediaObj.content.videoType;
          result.shardingKey = media.content.shardingKey;
          result.storeUrl = media.content.storeUrl;  
          result.cdnUrl = media.content.cdnUrl;  
        }
        return callback(null, result);
      }
      else {
        result = {videoStatus: 'non-existent'};  
        return callback(null, result);
      }
    });
  };  


  Media.remoteMethod('getVideo', {
    accepts: [
      { arg: 'id', type: 'string', required: true },
      { arg: 'req', type: 'object', 'http': { source: 'req' } }
    ],
    returns: [ { arg: 'result', type: 'object' } ],
    http: { path: '/:id/video', verb: 'get' }
  });


  Media.observe('before save', function(ctx, next) {
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

  Media.beforeRemote('deleteById', function(ctx, unused, next) {
    Media.findById(ctx.req.params.id, function(err, media) {
      if (err) {
        logger.error(err);
        return next(new createError.InternalServerError());
      }
      if (!media) {
        return next(new createError.NotFound('media not found'));
      }
      if (media) {
        gearClient.submitJob('deleteMediaImages', { media: media }, function(err) {
          if (err) { logger.error(err); }
        });
      }
      next();
    });
  });

  // restrict user only update 'caption' & 'title'
  Media.beforeRemote('prototype.updateAttributes', function(ctx, unused, next){
    for (var prop in ctx.req.body){
      if ((prop !== 'title') && (prop !== 'caption')){
        return next(new createError.NotFound('the attribute \'' + prop + '\' is prohibited to update'));
      }
    }
    next();
  });


  Media.findMediaById = function(id, req, callback) {
    logger.debug('in findMediaById');
    Media.findById(id, {
      include: [
        {
          relation: 'owner',
          scope: {
            fields: [ 'username', 'profilePhotoUrl', 'gaId' ],
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
    }, function(err, media) {
      if (err) {
        logger.error(err);
        return callback(new createError.InternalServerError());
      }
      if (!media) {
        return callback(new createError.NotFound('media not found'));
      }
      var mediaObj = media.toJSON();
      // if the media is not completed, just send status back to frontend
      if (mediaObj.status !== 'completed'){
        return callback(null, {sid: mediaObj.sid, status: mediaObj.status});
      }
      
      delete mediaObj.content.imgArrBoundary;
      if (req.query.withLike === 'true') {
        mediaObj.likes = utils.formatLikeList(mediaObj['_likes_'], req.accessToken ? req.accessToken.userId : null);
      }
      delete mediaObj['_likes_'];
      callback(null, mediaObj);
    });
  };

  Media.remoteMethod('findMediaById', {
    accepts: [
      { arg: 'id', type: 'string', required: true },
      { arg: 'req', type: 'object', 'http': { source: 'req' } }
    ],
    returns: [ { arg: 'result', type: 'object' } ],
    http: { path: '/:id', verb: 'get' }
  });
  
  // for SDK to getMedia, the http.path is added ':quality'
  Media.remoteMethod('findMediaById', {
    accepts: [
      { arg: 'id', type: 'string', required: true },
      { arg: 'req', type: 'object', 'http': { source: 'req' } }
    ],
    returns: [ { arg: 'result', type: 'object' } ],
    http: { path: '/:id/:quality', verb: 'get' }
  });

  Media.like = function(mediaId, req, callback) {
    Media.findById(mediaId, function(err, media) {
      if (err) {
        logger.error(err);
        return callback(err);
      }
      if (!media) {
        return callback(new createError.NotFound('media not found'));
      }
      if (!req.body.hasOwnProperty('userId')) {
        return callback(new createError.BadRequest('missing property: user ID'));
      }
      var userId = req.body.userId;
      var Like = Media.app.models.like;
      // Check if it is a duplicate like
      // FIXME: We should use composite id here instead of checking for duplicate entry
      //        by ourselves, however, loopback's datasource juggler has an issue for
      //        using composite id, so this is a temporary workaround until the issue
      //        is resovled.
      //
      //        Tracking issues:
      //          https://github.com/strongloop/loopback-datasource-juggler/issues/121
      //          https://github.com/strongloop/loopback-datasource-juggler/issues/478
      Like.find({where: {mediaId: mediaId, userId: userId}}, function(err, result) {
        if (err) {
          logger.error(err);
          return callback(new createError.InternalServerError());
        }
        if (result.length === 0) {
          Like.create({mediaId: mediaId, userId: userId}, function(err) {
            if (err) {
              logger.error(err);
              return callback(new createError.InternalServerError());
            }
            callback(null, 'success');
          });
        } else {
          // Ignore duplicate like
          callback(null, 'success');
        }
      });
    });
  };
  Media.remoteMethod('like', {
    accepts: [
      { arg: 'id', type: 'string', required: true },
      { arg: 'req', type: 'object', 'http': {source: 'req'} }
    ],
    returns: [ { arg: 'status', type: 'string' } ],
    http: { path: '/:id/like', verb: 'post' }
  });

  Media.unlike = function(mediaId, req, callback) {
    Media.findById(mediaId, function(err, media) {
      if (err) {
        logger.error(err);
        return callback(new createError.InternalServerError());
      }
      if (!media) {
        return callback(new createError.NotFound('media not found'));
      }
      if (!req.body.hasOwnProperty('userId')) {
        return callback(new createError.BadRequest('missing property: user ID'));
      }
      var userId = req.body.userId;
      var Like = Media.app.models.like;
      Like.destroyAll({mediaId: mediaId, userId: userId}, function(err) {
        if (err) {
          logger.error(err);
          return callback(new createError.InternalServerError());
        }
        callback(null, 'success');
      });
    });
  };
  Media.remoteMethod('unlike', {
    accepts: [
      { arg: 'id', type: 'string', require: true },
      { arg: 'req', type: 'object', 'http': {source: 'req'} }
    ],
    returns: [ { arg: 'status', type: 'string' } ],
    http: { path: '/:id/unlike', verb: 'post' }
  });

  Media.getLikeList = function(mediaId, req, callback) {
    var Like = Media.app.models.like;
    Like.find({
      where: { mediaId: mediaId },
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
        return callback(new createError.InternalServerError());
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
  Media.remoteMethod('getLikeList', {
    accepts: [
      { arg: 'id', type: 'string', require: true },
      { arg: 'req', type: 'object', 'http': { source: 'req' } }
    ],
    returns: [ { arg: 'result', type: 'object' } ],
    http: { path: '/:id/likes', verb: 'get' }
  });
};
