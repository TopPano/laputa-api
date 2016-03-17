module.exports = function (server) {
  // Install search route
  var router = server.loopback.Router();
  var Post = server.models.post;
  var Like = server.models.like;
  router.post('/api/search/recent', function(req, res) {
    var where = req.body.where || undefined;
    var PAGE_SIZE = 12;
    var limit = PAGE_SIZE;

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
        status: 'completed'
      },
      order: 'sid DESC',
      limit: limit + 1 // to see if we have next page
    }
    if (where && (typeof where === 'object')) {
      try {
        if ((where.sid.hasOwnProperty('lt') && (typeof where.sid.lt === 'string')) ||
            (where.sid.hasOwnProperty('gt') && (typeof where.sid.gt === 'string')))
        {
          query.where.sid = where.sid;
        } else {
          var error = new Error('Invalid query operator');
          error.status = 400;
          return callback(error);
        }
      } catch (e) {
        var error = new Error('Bad request');
        error.status = 400;
        return callback(error);
      }
    }
    Post.find(query, function(err, posts) {
      if (err) { return res.status(500).send('Internal Error'); }
      var output = { page: {}, feed: [] }, i;
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
      } else {
        output.page.hasNextPage = false;
        output.page.count = 0;
        output.page.start = null;
        output.page.end = null;
      }
      async.each(output.feed, function(post, callback) {
        async.parallel({
          likeCount: function(callback) {
            Like.find({where: {postId: post.sid}}, function(err, list) {
              if (err) { return callback(err); }
              callback(null, list.length);
            });
          },
          isLiked: function(callback) {
            if (!req.accessToken) {
              var error = new Error('Bad Request: missing access token');
              error.status = 400;
              return callback(error);
            }
            User.findById(req.accessToken.userId, function(err, profile) {
              if (err) { return callback(err); }
              if (!profile) { return callback(new Error('No user with this access token was found.')); }
              Like.find({where: {postId: post.sid, userId: req.accessToken.userId}}, function(err, list) {
                if (err) { return callback(err); }
                if (list.length !== 0) { callback(null, true); }
                else { callback(null, false); }
              });
            });
          },
          ownerInfo: function(callback) {
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
          if (err) { return callback(err); }
          post.likes = {
            count: results.likeCount,
            isLiked: results.isLiked
          };
          post.ownerInfo = results.ownerInfo;
          callback();
        });
      }, function(err) {
        if (err) {
          console.error(err);
          return callback(new Error('Internal Error'));
        }
        res.send(output);
      });
    });
  });
  server.use(router);
};
