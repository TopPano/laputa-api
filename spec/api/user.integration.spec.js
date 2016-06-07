/* jshint camelcase: false */
'use strict';
var app = require('../../server/server');
var Loader = require('../utils/fixtureLoader');
var request = require('supertest');
var should = require('should');
var assert = require('assert');
var async = require('async');

var apiVersion = require('../../package.json').version.split('.').shift();
var endpointRoot = '/api' + (apiVersion > 0 ? '/v' + apiVersion : '');
var endpoint = endpointRoot + '/users';
var User, Post, Follow, Like;

function json(verb, url) {
  return request(app)[verb](url)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/);
}

describe('Users - integration', function() {

  function loadUserAndPosts(cred, callback) {
    assert(cred.email);
    assert(cred.password);
    var User = app.models.user;
    var Post = app.models.post;
    var user = {};
    var posts = [];
    User.find({ where: { email: cred.email } }, function(err, result) {
      if (err) { return callback(err); }
      assert(result.length !== 0);
      user = result[0];
      User.login({ email: user.email, password: cred.password }, function(err, accessToken) {
        if (err) { return callback(err); }
        assert(accessToken.userId);
        assert(accessToken.id);
        user.accessToken = accessToken;
        Post.find({ where: { ownerId: user.sid } }, function(err, result) {
          if (err) { return callback(err); }
          posts = result;
          callback(null, { user: user, posts: posts });
        });
      });
    });
  }

  function createUserAndLogin(user, callback) {
    assert(user.email);
    assert(user.password);
    User.create(user, function(err, newUser) {
      if (err) { return callback(err); }
      assert(newUser.sid);
      assert.equal(newUser.email, user.email);
      User.login({email: user.email, password: user.password}, function(err, accessToken) {
        if (err) { return callback(err); }
        assert(accessToken.userId);
        assert(accessToken.id);
        callback(null, {sid: newUser.sid, accessToken: accessToken});
      });
    });
  }

  before(function() {
    User = app.models.user;
    Post = app.models.post;
    Follow = app.models.follow;
    Like = app.models.like;
  });

  describe('User querying', function() {
    var Richard = {};
    var Hawk = {};
    var Paco = {};
    var Eric = {};
    var RichardPosts = [];
    var HawkPosts = [];
    var PacoPosts = [];
    var EricPosts = [];

    before(function(done) {
      var loader = new Loader(app, __dirname + '/fixtures');
      loader.reset(function(err) {
        if (err) { throw new Error(err); }
        async.parallel({
          loadRichard: function(callback) {
            loadUserAndPosts({ email: 'richard.chou@toppano.in', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              Richard = result.user;
              RichardPosts = result.posts;
              callback();
            });
          },
          loadHawk: function(callback) {
            loadUserAndPosts({ email: 'hawk.lin@toppano.in', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              Hawk = result.user;
              HawkPosts = result.posts;
              callback();
            });
          },
          loadPaco: function(callback) {
            loadUserAndPosts({ email: 'paco@toppano.in', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              Paco = result.user;
              PacoPosts = result.posts;
              callback();
            });
          },
          loadEric: function(callback) {
            loadUserAndPosts({ email: 'sunright0414@gmail.com', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              Eric = result.user;
              EricPosts = result.posts;
              callback();
            });
          }
        }, function(err) {
          if (err) { return done(err); }
          async.parallel({
            // Richard
            // - like Hawk's post 7
            // - follow Hawk, Paco, and Eric
            RichardLikesHawkPosts7: function(callback) {
              Like.create({ postId: HawkPosts[7].sid, userId: Richard.sid }, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },
            RichardFollowsHawk: function(callback) {
              Follow.create({followerId: Richard.sid, followeeId: Hawk.sid, followAt: new Date()}, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },
            RichardFollowsPaco: function(callback) {
              Follow.create({followerId: Richard.sid, followeeId: Paco.sid, followAt: new Date()}, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },
            RichardFollowsEric: function(callback) {
              Follow.create({followerId: Richard.sid, followeeId: Eric.sid, followAt: new Date()}, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },

            // Paco
            // - like Hawk's post 7
            // - follow Hawk
            PacoLikesHawkPosts7: function(callback) {
              Like.create({ postId: HawkPosts[7].sid, userId: Paco.sid }, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },
            PacoFollowsHawk: function(callback) {
              Follow.create({followerId: Paco.sid, followeeId: Hawk.sid, followAt: new Date()}, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },

            // Eric
            // - follow Hawk and Paco
            EricFollowsHawk: function(callback) {
              Follow.create({followerId: Eric.sid, followeeId: Hawk.sid, followAt: new Date()}, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },
            EricFollowsPaco: function(callback) {
              Follow.create({followerId: Eric.sid, followeeId: Paco.sid, followAt: new Date()}, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            }
          }, function(err) {
            if (err) { return done(err); }
            done();
          });
        });
      });
    });

    it('query posts from following users (with default limit)', function(done) {
      var me = Paco;
      var totalPostCount = HawkPosts.length;
      assert(totalPostCount === 8);
      json('post', endpoint+'/'+me.sid+'/query?access_token='+me.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        assert(res.body.result);
        res.body.result.should.have.property('page');
        res.body.result.page.should.have.property('hasNextPage', false);
        res.body.result.page.should.have.property('count', totalPostCount);

        res.body.result.should.have.property('feed');
        res.body.result.feed.should.be.instanceof(Array).with.lengthOf(totalPostCount);
        res.body.result.feed[0].likes.should.have.properties({ count: 2, isLiked: true });
        res.body.result.feed[1].likes.should.have.properties({ count: 0, isLiked: false });
        done();
      });
    });

    it('query posts from following users (with default limit) (2)', function(done) {
      var me = Richard;
      var totalPostCount = HawkPosts.length + PacoPosts.length + EricPosts.length;
      assert(totalPostCount > 12);
      json('post', endpoint+'/'+me.sid+'/query?access_token='+me.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        assert(res.body.result);
        var totalPosts = HawkPosts.length + PacoPosts.length;
        res.body.result.should.have.property('page');
        res.body.result.page.should.have.property('hasNextPage', true);
        res.body.result.page.should.have.property('count', 12);

        res.body.result.should.have.property('feed');
        res.body.result.feed.should.be.instanceof(Array).with.lengthOf(12);
        done();
      });
    });

    it('query posts from following users (with custom limit)', function(done) {
      var me = Paco;
      var queryLimit = 1; // Show one post per page
      json('post', endpoint+'/'+me.sid+'/query?access_token='+me.accessToken.id)
      .send({limit: queryLimit})
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        assert(res.body.result.feed);
        res.body.result.should.have.property('page');
        res.body.result.page.should.have.property('hasNextPage', true);
        res.body.result.page.should.have.property('count', queryLimit);

        res.body.result.should.have.property('feed');
        res.body.result.feed.should.be.instanceof(Array).with.lengthOf(queryLimit);
        res.body.result.feed[0].likes.should.have.properties({ count: 2, isLiked: true });
        done();
      });
    });

    it('query posts from following users (with custom limit) (2)', function(done) {
      var me = Richard;
      var queryLimit = 3; // Show three posts per page
      json('post', endpoint+'/'+me.sid+'/query?access_token='+me.accessToken.id)
      .send({limit: queryLimit})
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        assert(res.body.result);
        res.body.result.should.have.property('page');
        res.body.result.page.should.have.property('hasNextPage', true);
        res.body.result.page.should.have.property('count', queryLimit);

        res.body.result.should.have.property('feed');
        res.body.result.feed.should.be.instanceof(Array).with.lengthOf(queryLimit);
        done();
      });
    });

    it('query two pages (with custom limit)', function(done) {
      var me = Eric;
      var queryLimit = 7; // Show three posts per page
      var totalPostCount = HawkPosts.length + PacoPosts.length;
      assert(totalPostCount > 7 && totalPostCount < 14); // to test the situation that total posts can be
                                                         // covered by two pages
      var firstPageCount = queryLimit;  // the first batch of posts, should be the same number of query limit
                                        // if the total posts number is greater than the limit
      var secondPageCount = totalPostCount - queryLimit; // the rest posts
      async.each([Hawk, Paco], function(user, callback) {
        json('post', endpoint+'/'+me.sid+'/follow/'+user.sid+'?access_token='+me.accessToken.id)
        .expect(200, function(err, res) {
          if (err) { return callback(err); }
          callback();
        });
      }, function(err) {
        if (err) { return done(err); }
        // Query the first page
        json('post', endpoint+'/'+me.sid+'/query?access_token='+me.accessToken.id)
        .send({limit: queryLimit})
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          assert(res.body.result);
          assert(res.body.result.page);
          assert(res.body.result.page.hasNextPage === true);
          assert(res.body.result.page.count === firstPageCount);
          assert(res.body.result.page.end);
          // Query the second page
          json('post', endpoint+'/'+me.sid+'/query?access_token='+me.accessToken.id)
          .send({
            where: {
              sid: { lt: res.body.result.page.end }
            },
            limit: queryLimit
          })
          .expect(200, function(err, res) {
            assert(res.body.result);
            res.body.result.should.have.property('page');
            res.body.result.page.should.have.property('hasNextPage', false);
            res.body.result.page.should.have.property('count', secondPageCount);

            res.body.result.should.have.property('feed');
            res.body.result.feed.should.be.instanceof(Array).with.lengthOf(secondPageCount);
            done();
          });
        });
      });
    });

    it('return 400 for invalid where query (unsupported query operator)', function(done) {
      var me = Richard;
      var queryLimit = 3; // Show three posts per page
      async.each([Hawk, Paco], function(user, callback) {
        json('post', endpoint+'/'+me.sid+'/follow/'+user.sid+'?access_token='+me.accessToken.id)
        .expect(200, function(err, res) {
          if (err) { return callback(err); }
          callback();
        });
      }, function(err) {
        if (err) { return done(err); }
        json('post', endpoint+'/'+me.sid+'/query?access_token='+me.accessToken.id)
        .send({limit: queryLimit})
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          json('post', endpoint+'/'+me.sid+'/query?access_token='+me.accessToken.id)
          .send({
            where: {
              sid: { set: res.body.result.page.end } // unsupported query operator: set
            },
            limit: queryLimit
          })
          .expect(400, function(err, res) {
            if (err) { return done(err); }
            done();
          });
        });
      });
    });

    it('return 400 for invalid where query (invalid query operator type)', function(done) {
      var me = Richard;
      var queryLimit = 3; // Show three posts per page
      async.each([Hawk, Paco], function(user, callback) {
        json('post', endpoint+'/'+me.sid+'/follow/'+user.sid+'?access_token='+me.accessToken.id)
        .expect(200, function(err, res) {
          if (err) { return callback(err); }
          callback();
        });
      }, function(err) {
        if (err) { return done(err); }
        json('post', endpoint+'/'+me.sid+'/query?access_token='+me.accessToken.id)
        .send({
          where: { sid: { lt: 1234 } }, // invalid operator type
          limit: queryLimit
        })
        .expect(400, function(err, res) {
          if (err) { return done(err); }
          done();
        });
      });
    });

    it('return 400 for invalid where query (unsupport query target)', function(done) {
      var me = Richard;
      var queryLimit = 3; // Show three posts per page
      async.each([Hawk, Paco], function(user, callback) {
        json('post', endpoint+'/'+me.sid+'/follow/'+user.sid+'?access_token='+me.accessToken.id)
        .expect(200, function(err, res) {
          if (err) { return callback(err); }
          callback();
        });
      }, function(err) {
        if (err) { return done(err); }
        json('post', endpoint+'/'+me.sid+'/query?access_token='+me.accessToken.id)
        .send({
          where: { set: { lt: '1234' } }, // unsupported query target: set
          limit: queryLimit
        })
        .expect(400, function(err, res) {
          if (err) { return done(err); }
          done();
        });
      });
    });
  });

  describe('User following', function() {
    var Richard = {};
    var Hawk = {};
    var Paco = {};
    var Eric = {};

    before(function(done) {
      var loader = new Loader(app, __dirname + '/fixtures');
      loader.reset(function(err) {
        if (err) { throw new Error(err); }
        async.parallel({
          loadRichard: function(callback) {
            loadUserAndPosts({ email: 'richard.chou@toppano.in', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              Richard = result.user;
              callback();
            });
          },
          loadHawk: function(callback) {
            loadUserAndPosts({ email: 'hawk.lin@toppano.in', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              Hawk = result.user;
              callback();
            });
          },
          loadPaco: function(callback) {
            loadUserAndPosts({ email: 'paco@toppano.in', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              Paco = result.user;
              callback();
            });
          },
          loadEric: function(callback) {
            loadUserAndPosts({ email: 'sunright0414@gmail.com', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              Eric = result.user;
              callback();
            });
          }
        }, function(err) {
          if (err) { return done(err); }
          async.parallel({
            RichardFollowsHawk: function(callback) {
              Follow.create({followerId: Richard.sid, followeeId: Hawk.sid, followAt: new Date()}, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },
            PacoFollowsHawk: function(callback) {
              Follow.create({followerId: Paco.sid, followeeId: Hawk.sid, followAt: new Date()}, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },
            EricFollowsHawk: function(callback) {
              Follow.create({followerId: Eric.sid, followeeId: Hawk.sid, followAt: new Date()}, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },
            EricFollowsPaco: function(callback) {
              Follow.create({followerId: Eric.sid, followeeId: Paco.sid, followAt: new Date()}, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            }
          }, function(err) {
            if (err) { return done(err); }
            done();
          });
        });
      });
    });

    it('get follower list of a given user and check the relation with each user in the list', function(done) {
      var me = Eric;
      json('get', endpoint+'/'+Hawk.sid+'/followers?access_token='+me.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.result.should.be.an.instanceof(Array).and.have.lengthOf(3);
        res.body.result.should.containDeep([
          { followerId: Richard.sid, isFollowing: false },
          { followerId: Paco.sid, isFollowing: true },
          { followerId: me.sid, isFollowing: false }
        ]);
        done();
      });
    });

    it('get following list of a given user and check the relation with each user in the list', function(done) {
      var me = Richard;
      json('get', endpoint+'/'+Eric.sid+'/following?access_token='+me.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.result.should.be.an.instanceof(Array).and.have.lengthOf(2);
        res.body.result.should.containDeep([
          { followeeId: Hawk.sid, isFollowing: true },
          { followeeId: Paco.sid, isFollowing: false }
        ]);
        done();
      });
    });
  });

  describe('User profile and posts', function() {
    var Richard = {};
    var Hawk = {};
    var Paco = {};
    var RichardPosts = [];
    var HawkPosts = [];
    var PacoPosts = [];

    before(function(done) {
      var loader = new Loader(app, __dirname + '/fixtures');
      loader.reset(function(err) {
        if (err) { throw new Error(err); }
        async.parallel({
          loadRichard: function(callback) {
            loadUserAndPosts({ email: 'richard.chou@toppano.in', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              Richard = result.user;
              RichardPosts = result.posts;
              callback();
            });
          },
          loadHawk: function(callback) {
            loadUserAndPosts({ email: 'hawk.lin@toppano.in', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              Hawk = result.user;
              HawkPosts = result.posts;
              callback();
            });
          },
          loadPaco: function(callback) {
            loadUserAndPosts({ email: 'paco@toppano.in', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              Paco = result.user;
              PacoPosts = result.posts;
              callback();
            });
          }
        }, function(err) {
          if (err) { return done(err); }
          async.parallel({
            RichardFollowsHawk: function(callback) {
              Follow.create({followerId: Richard.sid, followeeId: Hawk.sid, followAt: new Date()}, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },
            RichardFollowsPaco: function(callback) {
              Follow.create({followerId: Richard.sid, followeeId: Paco.sid, followAt: new Date()}, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },
            PacoFollowsHawk: function(callback) {
              Follow.create({followerId: Paco.sid, followeeId: Hawk.sid, followAt: new Date()}, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },
            HawkFollowsRichard: function(callback) {
              Follow.create({followerId: Hawk.sid, followeeId: Richard.sid, followAt: new Date()}, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },
            HawkLikesRichardPosts5: function(callback) {
              Like.create({ postId: RichardPosts[5].sid, userId: Hawk.sid }, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },
            PacoLikesRichardPosts5: function(callback) {
              Like.create({ postId: RichardPosts[5].sid, userId: Paco.sid }, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },
            RichardLikesRichardPosts4: function(callback) {
              Like.create({ postId: RichardPosts[4].sid, userId: Richard.sid }, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },
            RichardLikesHawkPosts7: function(callback) {
              Like.create({ postId: HawkPosts[7].sid, userId: Richard.sid }, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },
            PacoLikesHawkPosts6: function(callback) {
              Like.create({ postId: HawkPosts[6].sid, userId: Paco.sid }, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            }
          }, function(err) {
            if (err) { return done(err); }
            done();
          });
        });
      });
    });

    it('get user own profile', function(done) {
      var me = Richard;
      json('get', endpoint+'/'+me.sid+'/profile?access_token='+me.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.profile.should.have.properties({
          sid: me.sid,
          username: me.username,
          profilePhotoUrl: me.profilePhotoUrl,
          followers: 1,
          following: 2,
          posts: 6,
          isFollowing: false
        });
        done();
      });
    });

    it('get the profile from other user', function(done) {
      var me = Richard;
      json('get', endpoint+'/'+Hawk.sid+'/profile?access_token='+me.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.profile.should.have.properties({
          sid: Hawk.sid,
          username: Hawk.username,
          followers: 2,
          following: 1,
          posts: 8,
          isFollowing: true
        });
        done();
      });
    });

    it('query user own posts', function(done) {
      var me = Richard;
      var myPosts = RichardPosts;
      json('post', endpoint+'/'+me.sid+'/profile/query?access_token='+me.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.result.should.have.property('page');
        res.body.result.page.should.have.property('hasNextPage', false);
        res.body.result.page.should.have.property('count', myPosts.length);

        res.body.result.should.have.property('feed');
        res.body.result.feed.should.be.instanceof(Array).with.lengthOf(myPosts.length);
        res.body.result.feed[0].likes.should.have.properties({ count: 2, isLiked: false });
        res.body.result.feed[1].likes.should.have.properties({ count: 1, isLiked: true });
        done();
      });
    });

    it('return 401 if query user posts without authorization', function(done) {
      var me = Richard;
      json('post', endpoint+'/'+me.sid+'/profile/query')
      .expect(401, function(err, res) {
        if (err) { return done(err); }
        done();
      });
    });

    it('return 401 if query user posts without authorization (2)', function(done) {
      var me = Richard;
      json('post', endpoint+'/'+me.sid+'/profile/query?access_token=INVALID_ACCESS_TOKEN')
      .expect(401, function(err, res) {
        if (err) { return done(err); }
        done();
      });
    });

    it('query posts from other user', function(done) {
      var me = Richard;
      json('post', endpoint+'/'+Hawk.sid+'/profile/query?access_token='+me.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.result.should.have.property('page');
        res.body.result.page.should.have.property('hasNextPage', false);
        res.body.result.page.should.have.property('count', HawkPosts.length);

        res.body.result.should.have.property('feed');
        res.body.result.feed.should.be.instanceof(Array).with.lengthOf(HawkPosts.length);
        res.body.result.feed[0].likes.should.have.properties({ count: 1, isLiked: true });
        res.body.result.feed[1].likes.should.have.properties({ count: 1, isLiked: false });
        done();
      });
    });
  });
});
