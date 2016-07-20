var async = require('async');
var logger = require('winston');
var utils = require('../../common/utils');
var config = require('../api.json');
module.exports = function (server) {
  // Install explore route
  var router = server.loopback.Router();
  var Post = server.models.post;

  function recent(req, res) {
    logger.debug('in /api/explore/recent');
    var where = req.body.where || undefined;
    var userId = req.accessToken.userId || undefined;
    var limit = config.constants.query.PAGE_SIZE;

    if (!userId) {
      return res.status(500).send({error: 'Internal Error'});
    }

    if (req.body.limit) {
      if (typeof req.body.limit === 'string') {
        req.body.limit = parseInt(req.body.limit, 10);
      }
      if (req.body.limit > 0) {
        limit = req.body.limit;
      }
    }
    var query = {
      where: {
        status: 'completed',
        ownerId: { neq: userId }
      },
      order: 'sid DESC',
      limit: limit + 1, // to see if we have next page
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
    };
    if (where && (typeof where === 'object')) {
      try {
        if ((where.sid.hasOwnProperty('lt') && (typeof where.sid.lt === 'string')) ||
            (where.sid.hasOwnProperty('gt') && (typeof where.sid.gt === 'string')))
          {
            query.where.sid = where.sid;
          } else {
            return res.status(400).send({error: 'Invalid query operator'});
          }
      } catch (e) {
        logger.error(e);
        return res.status(400).send({error: 'Bad Request'});
      }
    }
    Post.find(query, function(err, posts) {
      if (err) { return res.status(500).send('Internal Error'); }
      var output = {
        page: {
          hasNextPage: false,
          count: 0,
          start: null,
          end: null
        },
        feed: []
      };
      if (!posts) {
        return res.send({result: output});
      }
      if (posts.length > limit) {
        output.page.hasNextPage = true;
        output.page.count = limit;
        output.page.start = posts[0].sid;
        output.page.end = posts[limit - 1].sid;
        output.feed = posts.slice(0, limit);
      } else if (0 < posts.length && posts.length <= limit) {
        output.page.hasNextPage = false;
        output.page.count = posts.length;
        output.page.start = posts[0].sid;
        output.page.end = posts[posts.length - 1].sid;
        output.feed = posts.slice(0, posts.length);
      }
      for (var i = 0; i < output.feed.length; i++) {
        var postObj = output.feed[i].toJSON();
        postObj.likes = utils.formatLikeList(postObj['_likes_'], userId);
        delete postObj['_likes_'];
        output.feed[i] = postObj;
      }
      res.send({result: output});
    });
  }

  router.post('/api/explore/recent', function(req, res) {
    recent(req, res);
  });

  // Deprecated
  router.post('/api/search/recent', function(req, res) {
    recent(req, res);
  });

  server.use(router);
};
