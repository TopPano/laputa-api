'use strict';
var assign = require('lodash/assign');
var moment = require('moment');
var async = require('async');
var logger = require('winston');
var VerpixId = require('../utils/verpix-id-gen');
var idGen = new VerpixId();

var gearClient = require('gearmanode').client();
gearClient.jobServers.forEach(function(server) {
  server.setOption('exceptions', function() {});
});


module.exports = function(Post) {

  Post.validatesInclusionOf('mediaType', { in: [ 'panoPhoto', 'livePhoto' ] });

  function getTimeNow() {
    return moment(new Date()).format('YYYY-MM-DD');
  }

  function createAsyncJob(options) {
    logger.debug('in createAsyncJob');
    var job;
    switch (options.jobType) {
      case 'panoPhoto': {
        logger.debug('creating async job: '+options.jobType);
        job = gearClient.submitJob('handlePanoPhoto', JSON.stringify({
          postId: options.postId,
          image: assign({}, options.image, { buffer: options.image.buffer.toString('base64') }),
          thumbnail: assign({}, options.thumbnail, { buffer: options.thumbnail.buffer.toString('base64') })
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
      case 'deletePanoPhoto': {
        var post = options.post;
        var list = [];
        list.push(post.thumbnail.srcUrl);
        list.push(post.thumbnail.downloadUrl);
        list.push(post.media.srcUrl);
        list.push(post.media.srcDownloadUrl);
        list = list.concat(post.media.srcTiledImages.map(function(image) { return image.srcUrl; }));
        list.push(post.media.srcMobileUrl);
        list.push(post.media.srcMobileDownloadUrl);
        list = list.concat(post.media.srcMobileTiledImages.map(function(image) { return image.srcUrl; }));
        job = gearClient.submitJob('deletePostImages', JSON.stringify({
          imageList: list
        }));
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

  Post.createPanoPhoto = function(req, callback) {
    logger.debug('in createPanoPhoto');
    try {
      var caption = req.body.caption;
      var imgBuf = req.files.image[0].buffer;
      var imgType = req.files.image[0].mimetype;
      var imgWidth = req.body.width;
      var imgHeight = req.body.height;
      var imgIndex = req.body.index;
      var thumbBuf = req.files.thumbnail[0].buffer;
      var thumbType = req.files.thumbnail[0].mimetype;
      var thumbLat = req.body.thumbLat;
      var thumbLng = req.body.thumbLng;
      var locationProvider = req.body.locationProvider || 'facebook';
      var locationProviderId = req.body.locationProviderId || null;
      var locationName = req.body.locationName || null;
      var locationCity = req.body.locationCity || null;
      var locationStreet = req.body.locationStreet || null;
      var locationZip = req.body.locationZip || null;
      var locationLat = req.body.locationLat || null;
      var locationLng = req.body.locationLng || null;
      var now = getTimeNow();

      if (!thumbBuf || !thumbType || !thumbLat || !thumbLng) {
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
      var mediaType = 'panoPhoto';

      var postObj = {
        mediaType: mediaType,
        dimension: {
          width: imgWidth,
          height: imgHeight,
          lat: thumbLat,
          lng: thumbLng
        },
        caption: caption,
        ownerId: req.accessToken.userId
      };
      if (locationProviderId) {
        logger.debug('creating panoPhoto with location provider ID');
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
          if (err) { return callback(err); }
          if (!location) {
            var error = new Error('Failed to Create Location');
            error.status = 500;
            return callback(error);
          }
          logger.debug('location created');
          postObj.locationId = location.id;
          Post.create(postObj, function(err, post) {
            if (err) { return callback(err); }
            // create a job for worker
            createAsyncJob({
              jobType: mediaType,
              postId: post.sid,
              image: {
                width: imgWidth,
                height: imgHeight,
                buffer: imgBuf,
                hasZipped: true
              },
              thumbnail: { buffer: thumbBuf }
            });
            logger.debug('post created');
            callback(null, { postId: post.sid });
          });
        });
      } else if (locationName) {
        logger.debug('creating panoPhoto with only location name');
        Location.create({
          name: locationName,
          geo: {
            lat: locationLat,
            lng: locationLng
          }
        }, function(err, location) {
          if (err) { return callback(err); }
          if (!location) {
            var error = new Error('Failed to Create Location');
            error.status = 500;
            return callback(error);
          }
          logger.debug('location created');
          postObj.locationId = location.id;
          Post.create(postObj, function(err, post) {
            if (err) { return callback(err); }
            // create a job for worker
            createAsyncJob({
              jobType: mediaType,
              postId: post.sid,
              image: {
                width: imgWidth,
                height: imgHeight,
                buffer: imgBuf,
                hasZipped: true
              },
              thumbnail: { buffer: thumbBuf }
            });
            logger.debug('post created');
            callback(null, { postId: post.sid });
          });
        });
      } else {
        logger.debug('create panoPhoto without location');
        Post.create(postObj, function(err, post) {
          if (err) { return callback(err); }
          // create a job for worker
          createAsyncJob({
            jobType: mediaType,
            postId: post.sid,
            image: {
              width: imgWidth,
              height: imgHeight,
              buffer: imgBuf,
              hasZipped: true
            },
            thumbnail: { buffer: thumbBuf }
          });
          logger.debug('post created');
          callback(null, { postId: post.sid });
        });
      }
    } catch(error) {
      return callback(error);
    }
  };
  Post.remoteMethod('createPanoPhoto', {
    accepts: [
      { arg: 'req', type: 'object', 'http': { source: 'req' } }
    ],
    returns: [ { arg: 'result', type: 'objct' } ],
    http: { path: '/panophoto', verb: 'post' }
  });

  Post.beforeRemote('deleteById', function(ctx, unused, next) {
    Post.findById(ctx.req.params.id, function(err, post) {
      if (err) { return next(err); }
      if (!post) {
        var error = new Error('Post Not Found');
        error.status = 404;
        return next(error);
      }
      createAsyncJob({ jobType: 'deletePanoPhoto', post: post });
      next();
    });
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
      logger.debug('post found');
      var Like = Post.app.models.like;
      var User = Post.app.models.user;
      async.parallel({
        likeCount: function(callback) {
          Like.find({ where: { postId: post.sid } }, function(err, list) {
            if (err) { return callback(err); }
            callback(null, list.length);
          });
        },
        isLiked: function(callback) {
          if (req.accessToken) {
            User.findById(req.accessToken.userId, function(err, profile) {
              if (err) { return callback(err); }
              if (!profile) { return callback(new Error('No user with this access token was found.')); }
              Like.find({ where: { postId: post.sid, userId: req.accessToken.userId } }, function(err, list) {
                if (err) { return callback(err); }
                if (list.length !== 0) { callback(null, true); }
                else { callback(null, false); }
              });
            });
          } else {
            callback(null, false);
          }
        }
      }, function(err, results) {
        if (err) { return callback(err); }
        post.likes = {
          count: results.likeCount,
          isLiked: results.isLiked
        };
        logger.debug('post returned');
        callback(null, post);
      });
    });
  };
  Post.remoteMethod('findPostById', {
    accepts: [
      { arg: 'id', type: 'string', require: true },
      { arg: 'req', type: 'object', 'http': { source: 'req' } }
    ],
    returns: [ { arg: 'result', type: 'objct' } ],
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
                where: { followerId: req.accessToken.userId },
                fields: [ 'followeeId', 'followerId', 'followAt' ]
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
      callback(null, likes);
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
