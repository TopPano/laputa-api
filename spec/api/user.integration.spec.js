/* jshint camelcase: false */
'use strict';
var app = require('../../server/server');
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

  before(function() {
    User = app.models.user;
    Post = app.models.post;
    Follow = app.models.follow;
    Like = app.models.like;
  });

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

  describe('User following', function() {
    var me = {
      username: 'me',
      email: 'me@foo.com',
      password: 'password'
    };
    var Michael = {
      userData: {
        username: 'Michael',
        email: 'mike@foo.com',
        password: 'xx'
      },
      posts: [
        {
          message: 'I am here!!'
        },
        {
          message: 'Hello world'
        }
      ]
    };
    var Denial = {
      userData: {
        username: 'Denial',
        email: 'denial@foo.com',
        password: 'xxx'
      },
      posts: [
        {
          message: 'sleepy....'
        }
      ]
    };
    var Tim = {
      userData: {
        username: 'Tim',
        email: 'tim@foo.com',
        password: 'xxxx'
      },
      posts: [
        {
          message: 'Running along Charles River.'
        },
        {
          message: 'Yeah, so Patagonia is f-ing beautiful! Not a bad view to wake up to!'
        },
        {
          message: 'Evenings in Madrid'
        }
      ]
    };
    before(function(done) {
      // create users
      async.each([me, Denial.userData, Michael.userData, Tim.userData], function(user, callback) {
        createUserAndLogin(user, function(err, result) {
          if (err) { return callback(err); }
          user.sid = result.sid;
          user.accessToken = result.accessToken;
          callback();
        });
      }, function(err) {
        if (err) { return done(err); }
        // create posts for each of the user
        // XXX: It's a bit ugly
        async.each([Michael, Denial, Tim], function(user, callback) {
          async.eachSeries(user.posts, function(post, callback) {
            post.ownerId = user.userData.sid;
            Post.create(post, function(err, newPost) {
              if (err) { return callback(err); }
              post.sid = newPost.sid;
              callback();
            });
          }, function(err) {
            if (err) { return callback(err); }
            callback();
          });
        }, function(err) {
          if (err) { return done(err); }
          // follow friends and like their posts
          async.parallel({
            meLikedMichaelPost2: function(callback) {
              Like.create({postId: Michael.posts[1].sid, userId: me.sid}, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },
            MichaelLikedDenialPost1: function(callback) {
              Like.create({postId: Denial.posts[0].sid, userId: Michael.userData.sid}, function(err) {
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

    afterEach(function(done) {
      // unfollow all the users for me
      async.each([Michael, Denial, Tim], function(user, callback) {
        json('post', endpoint+'/'+me.sid+'/unfollow/'+user.userData.sid+'?access_token='+me.accessToken.id)
        .expect(200, function(err, res) {
          if (err) { return callback(err); }
          callback();
        });
      }, function(err) {
        if (err) { return done(err); }
        done();
      });
    });

    it('follow a user and query his/her posts (with default limit)', function(done) {
      json('post', endpoint+'/'+me.sid+'/follow/'+Michael.userData.sid+'?access_token='+me.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        json('post', endpoint+'/'+me.sid+'/query?access_token='+me.accessToken.id)
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          assert(res.body.result);
          res.body.result.should.have.property('page');
          res.body.result.page.should.have.property('hasNextPage', false);
          res.body.result.page.should.have.property('count', Michael.posts.length);

          res.body.result.should.have.property('feed');
          res.body.result.feed.should.be.instanceof(Array).with.lengthOf(Michael.posts.length);
          res.body.result.feed[0].likes.should.have.properties({ count: 1, isLiked: true });
          res.body.result.feed[1].likes.should.have.properties({ count: 0, isLiked: false });
          done();
        });
      });
    });

    it('follow a user and query his/her posts (with custom limit)', function(done) {
      var queryLimit = 1; // Show one post per page
      json('post', endpoint+'/'+me.sid+'/follow/'+Michael.userData.sid+'?access_token='+me.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
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
          res.body.result.feed[0].likes.should.have.properties({ count: 1, isLiked: true });
          done();
        });
      });
    });

    it('follow several users and query their posts (with default limit)', function(done) {
      async.each([Michael, Tim], function(user, callback) {
        json('post', endpoint+'/'+me.sid+'/follow/'+user.userData.sid+'?access_token='+me.accessToken.id)
        .expect(200, function(err, res) {
          if (err) { return callback(err); }
          callback();
        });
      }, function(err) {
        if (err) { return done(err); }
        json('post', endpoint+'/'+me.sid+'/query?access_token='+me.accessToken.id)
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          assert(res.body.result);
          var totalPosts = Michael.posts.length + Tim.posts.length;
          res.body.result.should.have.property('page');
          res.body.result.page.should.have.property('hasNextPage', false);
          res.body.result.page.should.have.property('count', totalPosts);

          res.body.result.should.have.property('feed');
          res.body.result.feed.should.be.instanceof(Array).with.lengthOf(totalPosts);
          done();
        });
      });
    });

    it('follow several users and query their posts (with custom limit)', function(done) {
      var queryLimit = 3; // Show three posts per page
      async.each([Michael, Tim], function(user, callback) {
        json('post', endpoint+'/'+me.sid+'/follow/'+user.userData.sid+'?access_token='+me.accessToken.id)
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
          assert(res.body.result);
          res.body.result.should.have.property('page');
          res.body.result.page.should.have.property('hasNextPage', true);
          res.body.result.page.should.have.property('count', queryLimit);

          res.body.result.should.have.property('feed');
          res.body.result.feed.should.be.instanceof(Array).with.lengthOf(queryLimit);
          done();
        });
      });
    });

    it('query two pages (with custom limit)', function(done) {
      var queryLimit = 3; // Show three posts per page
      var firstPageCount = queryLimit;  // the first batch of posts, should be the same number of query limit
                                        // if the total posts number is greater than the limit
      var secondPageCount = (Michael.posts.length + Tim.posts.length) - queryLimit; // the rest posts
      async.each([Michael, Tim], function(user, callback) {
        json('post', endpoint+'/'+me.sid+'/follow/'+user.userData.sid+'?access_token='+me.accessToken.id)
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
      var queryLimit = 3; // Show three posts per page
      async.each([Michael, Tim], function(user, callback) {
        json('post', endpoint+'/'+me.sid+'/follow/'+user.userData.sid+'?access_token='+me.accessToken.id)
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
      var queryLimit = 3; // Show three posts per page
      async.each([Michael, Tim], function(user, callback) {
        json('post', endpoint+'/'+me.sid+'/follow/'+user.userData.sid+'?access_token='+me.accessToken.id)
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
      var queryLimit = 3; // Show three posts per page
      async.each([Michael, Tim], function(user, callback) {
        json('post', endpoint+'/'+me.sid+'/follow/'+user.userData.sid+'?access_token='+me.accessToken.id)
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

  describe('User profile and posts', function() {
    var me = {
      userData: {
        username: 'me2',
        email: 'me2@foo.com',
        password: 'password',
        profilePhotoUrl: 'http://aws.com/',
        autobiography: 'Hi, I am Richard'
      },
      posts: [
        {
          message: 'Hello Paris!!'
        },
        {
          message: 'Let us not take our planet for granted.'
        },
        {
          message: 'Sure, why not! Be my guest!'
        }
      ]
    };
    var Jeffrey = {
      userData: {
        username: 'Jeffrey',
        email: 'jeffrey@foo.com',
        password: 'xx'
      },
      posts: [
        {
          message: 'Run IBM run!!'
        },
        {
          message: 'My running squad #2...'
        },
        {
          message: 'Happy Chinese New Year...'
        }
      ]
    };
    var Joey = {
      userData: {
        username: 'Joey',
        email: 'joey@foo.com',
        password: 'xxx'
      },
      posts: [
        {
          message: 'Running along Charles River.'
        },
        {
          message: 'Going to give it a try this weekend. Hopefully Chef Watson has a good taste ...'
        },
        {
          message: 'Brilliant idea !'
        }
      ]
    };
    before(function(done) {
      async.each([me.userData, Jeffrey.userData, Joey.userData], function(user, callback) {
        createUserAndLogin(user, function(err, result) {
          if (err) { return callback(err); }
          user.sid = result.sid;
          user.accessToken = result.accessToken;
          callback();
        });
      }, function(err) {
        if (err) { return done(err); }
        async.parallel({
          createPost: function(callback) {
            // XXX: It's a bit ugly
            async.each([me, Jeffrey, Joey], function(user, callback) {
              async.eachSeries(user.posts, function(post, callback) {
                post.ownerId = user.userData.sid;
                Post.create(post, function(err, newPost) {
                  if (err) { return callback(err); }
                  post.sid = newPost.sid;
                  callback();
                });
              }, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            }, function(err) {
              if (err) { return callback(err); }
              callback();
            });
          },
          meFollowJeffrey: function(callback) {
            Follow.create({followerId: me.userData.sid, followeeId: Jeffrey.userData.sid, followAt: new Date()}, function(err) {
              if (err) { return callback(err); }
              callback();
            });
          },
          meFollowJoey: function(callback) {
            Follow.create({followerId: me.userData.sid, followeeId: Joey.userData.sid, followAt: new Date()}, function(err) {
              if (err) { return callback(err); }
              callback();
            });
          },
          JeffreyFollowJoey: function(callback) {
            Follow.create({followerId: Jeffrey.userData.sid, followeeId: Joey.userData.sid, followAt: new Date()}, function(err) {
              if (err) { return callback(err); }
              callback();
            });
          },
          JoeyFollowJeffrey: function(callback) {
            Follow.create({followerId: Joey.userData.sid, followeeId: Jeffrey.userData.sid, followAt: new Date()}, function(err) {
              if (err) { return callback(err); }
              callback();
            });
          }
        }, function(err) {
          if (err) { return done(err); }
          async.parallel({
            meLikedJeffreyPost3: function(callback) {
              Like.create({postId: Jeffrey.posts[2].sid, userId: me.userData.sid}, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },
            meLikedJoeyPost1: function(callback) {
              Like.create({postId: Joey.posts[0].sid, userId: me.userData.sid}, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },
            JeffreyLikedMyPost3: function(callback) {
              Like.create({postId: me.posts[2].sid, userId: Jeffrey.userData.sid}, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },
            JoeyLikedMyPost3: function(callback) {
              Like.create({postId: me.posts[2].sid, userId: Joey.userData.sid}, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },
            ILikedMyPost2: function(callback) {
              Like.create({postId: me.posts[1].sid, userId: me.userData.sid}, function(err) {
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
      json('get', endpoint+'/'+me.userData.sid+'/profile?access_token='+me.userData.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.profile.should.have.properties({
          sid: me.userData.sid,
          username: me.userData.username,
          profilePhotoUrl: me.userData.profilePhotoUrl,
          autobiography: me.userData.autobiography,
          followers: 0,
          following: 2,
          posts: 3,
          isFollowing: false
        });
        done();
      });
    });

    it('get the profile from other user', function(done) {
      json('get', endpoint+'/'+Jeffrey.userData.sid+'/profile?access_token='+me.userData.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.profile.should.have.properties({
          sid: Jeffrey.userData.sid,
          username: Jeffrey.userData.username,
          followers: 2,
          following: 1,
          posts: 3,
          isFollowing: true
        });
        done();
      });
    });

    it('query user own posts', function(done) {
      json('post', endpoint+'/'+me.userData.sid+'/profile/query?access_token='+me.userData.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.result.should.have.property('page');
        res.body.result.page.should.have.property('hasNextPage', false);
        res.body.result.page.should.have.property('count', me.posts.length);

        res.body.result.should.have.property('feed');
        res.body.result.feed.should.be.instanceof(Array).with.lengthOf(me.posts.length);
        res.body.result.feed[0].likes.should.have.properties({ count: 2, isLiked: false });
        res.body.result.feed[1].likes.should.have.properties({ count: 1, isLiked: true });
        done();
      });
    });

    it('query posts from other user', function(done) {
      json('post', endpoint+'/'+Jeffrey.userData.sid+'/profile/query?access_token='+me.userData.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.result.should.have.property('page');
        res.body.result.page.should.have.property('hasNextPage', false);
        res.body.result.page.should.have.property('count', Jeffrey.posts.length);

        res.body.result.should.have.property('feed');
        res.body.result.feed.should.be.instanceof(Array).with.lengthOf(Jeffrey.posts.length);
        res.body.result.feed[0].likes.should.have.properties({ count: 1, isLiked: true });
        done();
      });
    });
  });
});
