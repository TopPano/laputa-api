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
var User, Post;

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
    var friend1 = {
      userData: {
        username: 'Michael',
        email: 'mike@foo.com',
        password: 'xx'
      },
      posts: [
        {
          likes: 10,
          message: 'I am here!!'
        },
        {
          likes: 13,
          message: 'Hello world'
        }
      ]
    };
    var friend2 = {
      userData: {
        username: 'Tim',
        email: 'tim@foo.com',
        password: 'xxx'
      },
      posts: [
        {
          likes: 501,
          message: 'Rolling Stones are a dangerous problem in Torres del Paine. Always trying to start it up!'
        },
        {
          likes: 712,
          message: 'Yeah, so Patagonia is f-ing beautiful! Not a bad view to wake up to!'
        },
        {
          likes: 611,
          message: 'Evenings in Madrid'
        }
      ]
    };
    before(function(done) {
      async.each([me, friend1.userData, friend2.userData], function(user, callback) {
        createUserAndLogin(user, function(err, result) {
          if (err) { return callback(err); }
          user.sid = result.sid;
          user.accessToken = result.accessToken;
          callback();
        });
      }, function(err) {
        if (err) { return done(err); }
        // XXX: It's a bit ugly
        async.each([friend1, friend2], function(user, callback) {
          async.each(user.posts, function(post, callback) {
            post.ownerId = user.userData.sid;
            Post.create(post, function(err) {
              if (err) { return callback(err); }
              callback();
            });
          }, function(err) {
            if (err) { return callback(err); }
            callback();
          });
        }, function(err) {
          if (err) { return done(err); }
          done();
        });
      });
    });

    it('follow a user and query his/her posts (with default limit)', function(done) {
      json('post', endpoint+'/'+me.sid+'/follow/'+friend1.userData.sid+'?access_token='+me.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        json('post', endpoint+'/'+me.sid+'/query?access_token='+me.accessToken.id)
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          assert(res.body.result);
          res.body.result.should.have.property('page');
          res.body.result.page.should.have.property('hasNextPage', false);
          res.body.result.page.should.have.property('count', friend1.posts.length);

          res.body.result.should.have.property('feed');
          res.body.result.feed.should.be.instanceof(Array).with.lengthOf(friend1.posts.length);
          done();
        });
      });
    });

    it('follow a user and query his/her posts (with custom limit)', function(done) {
      var queryLimit = 1; // Show one post per page
      json('post', endpoint+'/'+me.sid+'/follow/'+friend1.userData.sid+'?access_token='+me.accessToken.id)
      .expect(200, function(err, res) {
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

    it('follow several users and query their posts (with default limit)', function(done) {
      async.each([friend1, friend2], function(user, callback) {
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
          var totalPosts = friend1.posts.length + friend2.posts.length;
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
      async.each([friend1, friend2], function(user, callback) {
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
      var secondPageCount = (friend1.posts.length + friend2.posts.length) - queryLimit; // the rest posts
      async.each([friend1, friend2], function(user, callback) {
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
      async.each([friend1, friend2], function(user, callback) {
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
      async.each([friend1, friend2], function(user, callback) {
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
      async.each([friend1, friend2], function(user, callback) {
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
});
