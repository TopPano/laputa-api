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

var MEDIA_PANO_PHOTO = 'panoPhoto';
var MEDIA_LIVE_PHOTO = 'livePhoto';

module.exports = function(Post) {

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

  function createPostForeground(mediaType, req, callback) {
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
      var imgDirection = req.body.recordDirection ? req.body.recordDirection.trim().toLowerCase() : null;
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
        if (!imgOrientation || !imgDirection || !imgArrBoundary) {
          return callback(new createError.BadRequest(
            'missing properties'
          ));
        }
        if (![ 'landscape', 'portrait' ].find(function(value) { return value === imgOrientation; })) {
          return callback(new createError.BadRequest(
            'invalid orientation value'
          ));
        }
        if (![ 'horizontal', 'vertical' ].find(function(value) { return value === imgDirection; })) {
          return callback(new createError.BadRequest(
            'invalid direction value'
          ));
        }
      }

      /* thumbnail */
      var thumbBuf = req.files.thumbnail[0].buffer;
      var thumbType = req.files.thumbnail[0].mimetype;
      var thumbLat = req.body.thumbLat;
      var thumbLng = req.body.thumbLng;

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
      var caption = req.body.caption;

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

      var now = getTimeNow();

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
              logger.error('Failed to create location');
              reject(new createError.InternalServerError());
            }
            else { resolve(post); }
          });
        });
      })
      .then(function(post) {
        var params = {
          mediaType: mediaType,
          postId: post.id,
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
          params.image.arrayBoundary = imgArrBoundary;
        }
        createPostBackground(params);
        callback(null, {
          postId: post.id
        });
      })
      .catch(function(err) {
        logger.error(err);
        if (err.status && err.status >= 400 && err.status < 500) {
          callback(err);
        } else {
          callback(new createError.InternalServerErrorerror());
        }
      });
    } catch(error) {
      return callback(error);
    }
  }

  function createPostBackground(params) {
    var jobName;
    if      (params.mediaType === MEDIA_PANO_PHOTO) { jobName = 'postProcessingPanoPhoto'; }
    else if (params.mediaType === MEDIA_LIVE_PHOTO) { jobName = 'postProcessingLivePhoto'; }
    gearClient.submitJob(jobName, params, function(err, result) {
      if (err) {
        logger.error(err);
        Post.updateAll({ sid: params.postId }, {
          status: 'failed'
        }, function(err) {
          if (err) { logger.error(err); }
        });
      } else {
        var media;
        if (result.mediaType === MEDIA_PANO_PHOTO) {
          media = {
            srcUrl: result.srcUrl,
            srcDownloadUrl: result.srcDownloadUrl,
            srcTiledImages: result.srcTiledImages,
            srcMobileUrl: result.srcMobileUrl,
            srcMobileDownloadUrl: result.srcMobileDownloadUrl,
            srcMobileTiledImages: result.srcMobileTiledImages
          };
        } else if (result.mediaType === MEDIA_LIVE_PHOTO) {
          media = {
            srcUrl: result.srcUrl,
            srcDownloadUrl: result.srcDownloadUrl,
            srcHighImages: result.srcHighImages,
            srcLowImages: result.srcLowImages
          };
        } else {
          return logger.error(new Error('Caught invalid media type response: id: ' + params.postId));
        }
        Post.updateAll({ sid: params.postId }, {
          status: 'completed',
          thumbnail: {
            srcUrl: result.thumbUrl,
            downloadUrl: result.thumbDownloadUrl
          },
          media: media
        }, function(err) {
          if (err) { return logger.error(err); }

          /* share */
          if (params.share.length !== 0) {
            params.share.forEach(function(target) {
              var jobName = target.name;
              gearClient.submitJob(jobName, {
                postId: params.postId,
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

  Post.createPanoPhoto = function(req, callback) {
    logger.debug('in createPanoPhoto');
    createPostForeground(MEDIA_PANO_PHOTO, req, callback);
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
    createPostForeground(MEDIA_LIVE_PHOTO, req, callback);
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
      if (err) {
        logger.error(err);
        return next(new createError.InternalServerError());
      }
      if (!post) {
        return next(new createError.NotFound('post not found'));
      }
      var list = [];
      // XXX: Currently we are using AWS S3 as our object store, since S3 does not support bulk delete using
      //      wildcard (so stupid...) so we have to enumerate the objects of the post that need to be deleted.
      //
      //      see https://forums.aws.amazon.com/thread.jspa?threadID=85996
      switch (post.mediaType) {
        case MEDIA_PANO_PHOTO:
          if (post.thumbnail && post.thumbnail.srcUrl) {
            list.push(post.thumbnail.srcUrl);
          }
          if (post.media) {
            if (post.media.srcUrl) list.push(post.media.srcUrl);
            if (post.media.srcTiledImages) {
              list = list.concat(post.media.srcTiledImages.map(function(image) { return image.srcUrl; }));
            }
            if (post.media.srcMobileUrl) list.push(post.media.srcMobileUrl);
            if (post.media.srcMobileTiledImages !== undefined) {
              list = list.concat(post.media.srcMobileTiledImages.map(function(image) { return image.srcUrl; }));
            }
          }
          break;
        case MEDIA_LIVE_PHOTO:
          if (post.thumbnail && post.thumbnail.srcUrl) {
            list.push(post.thumbnail.srcUrl);
          }
          if (post.media) {
            if (post.media.srcUrl) list.push(post.media.srcUrl);
            if (post.media.srcHighImages) {
              list = list.concat(post.media.srcHighImages.map(function(image) { return image.srcUrl; }));
            }
            if (post.media.srcLowImages) {
              list = list.concat(post.media.srcLowImages.map(function(image) { return image.srcUrl; }));
            }
          }
          break;
        default:
          break;
      }
      if (list.length !== 0) {
        gearClient.submitJob('deletePostImages', { imageList: list }, function(err) {
          if (err) { logger.error(err); }
        });
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
      if (err) {
        logger.error(err);
        return callback(new createError.InternalServerError());
      }
      if (!post) {
        return callback(new createError.NotFound('post not found'));
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
        return callback(new createError.NotFound('post not found'));
      }
      if (!req.body.hasOwnProperty('userId')) {
        return callback(new createError.BadRequest('missing property: user ID'));
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
        if (err) {
          logger.error(err);
          return callback(new createError.InternalServerError());
        }
        if (result.length === 0) {
          Like.create({postId: postId, userId: userId}, function(err) {
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
        return callback(new createError.InternalServerError());
      }
      if (!post) {
        return callback(new createError.NotFound('post not found'));
      }
      if (!req.body.hasOwnProperty('userId')) {
        return callback(new createError.BadRequest('missing property: user ID'));
      }
      var userId = req.body.userId;
      var Like = Post.app.models.like;
      Like.destroyAll({postId: postId, userId: userId}, function(err) {
        if (err) {
          logger.error(err);
          return callback(new createError.InternalServerError());
        }
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
  Post.remoteMethod('getLikeList', {
    accepts: [
      { arg: 'id', type: 'string', require: true },
      { arg: 'req', type: 'object', 'http': { source: 'req' } }
    ],
    returns: [ { arg: 'result', type: 'object' } ],
    http: { path: '/:id/likes', verb: 'get' }
  });
};
