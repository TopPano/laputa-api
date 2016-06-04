/* jshint camelcase: false */
'use strict';
var app = require('../../server/server');
var Loader = require('../utils/fixtureLoader');
var request = require('supertest');
var should = require('should');
var assert = require('assert');
var async = require('async');
var zlib = require('zlib');

var apiVersion = require('../../package.json').version.split('.').shift();
var endpointRoot = '/api' + (apiVersion > 0 ? '/v' + apiVersion :  '');
var endpoint = endpointRoot + '/posts';
var User, Post;

function json(verb, url, contentType) {
  return request(app)[verb](url)
    .set('Content-Type', contentType ? contentType : 'application/json')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/);
}

describe('Posts - integration', function() {

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

  describe('Post - like', function() {
    var Hawk = {};
    var Richard = {};
    var Paco = {};
    var HawkPosts = [];
    var RichardPosts = [];
    var PacoPosts = [];

    before(function(done) {
      var loader = new Loader(app, __dirname + '/fixtures');
      loader.reset(function(err) {
        if (err) { throw new Error(err); }
        async.parallel({
          loadHawk: function(callback) {
            loadUserAndPosts({ email: 'hawk.lin@toppano.in', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              Hawk = result.user;
              HawkPosts = result.posts;
              callback();
            });
          },
          loadRichard: function(callback) {
            loadUserAndPosts({ email: 'richard.chou@toppano.in', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              Richard = result.user;
              RichardPosts = result.posts;
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
          done();
        });
      });
    });

    /*
    beforeEach(function(done) {
      json('post', endpoint+'/'+post.sid+'/unlike?access_token='+user.accessToken.id)
      .send({userId: user.sid})
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        json('post', endpoint+'/'+post.sid+'/unlike?access_token='+anotherUser.accessToken.id)
        .send({userId: anotherUser.sid})
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          done();
        });
      });
    });
    */

    it('like a post and the count should increase 1', function(done) {
      var user = Richard;
      var post = HawkPosts[0];
      var currentCount;
      json('get', endpoint+'/'+post.sid)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        assert(typeof res.body.result.likes === 'object');
        currentCount = res.body.result.likes.count;
        json('post', endpoint+'/'+post.sid+'/like?access_token='+user.accessToken.id)
        .send({userId: user.sid})
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          json('get', endpoint+'/'+post.sid)
          .expect(200, function(err, res) {
            if (err) { return done(err); }
            res.body.result.likes.should.have.property('count', currentCount + 1);
            done();
          });
        });
      });
    });

    it('like a post by different users', function(done) {
      var user1 = Richard;
      var user2 = Paco;
      var post = HawkPosts[1];
      var currentCount;
      json('get', endpoint+'/'+post.sid)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        assert(typeof res.body.result.likes === 'object');
        currentCount = res.body.result.likes.count;
        json('post', endpoint+'/'+post.sid+'/like?access_token='+user1.accessToken.id)
        .send({userId: user1.sid})
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          json('post', endpoint+'/'+post.sid+'/like?access_token='+user2.accessToken.id)
          .send({userId: user2.sid})
          .expect(200, function(err, res) {
            if (err) { return done(err); }
            json('get', endpoint+'/'+post.sid)
            .expect(200, function(err, res) {
              if (err) { return done(err); }
              res.body.result.likes.count.should.equal(currentCount + 2);
              done();
            });
          });
        });
      });
    });

    it('retrun the liked user list of a given post', function(done) {
      var user1 = Richard;
      var user2 = Paco;
      var postOwner = Hawk;
      var post = HawkPosts[2];
      json('post', endpoint+'/'+post.sid+'/like?access_token='+user1.accessToken.id)
      .send({userId: user1.sid})
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        json('post', endpoint+'/'+post.sid+'/like?access_token='+user2.accessToken.id)
        .send({userId: user2.sid})
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          json('get', endpoint+'/'+post.sid+'/likes?access_token='+postOwner.accessToken.id)
          .expect(200, function(err, res) {
            if (err) { return done(err); }
            res.body.result.should.containDeep([ { userId: user1.sid }, { userId: user2.sid } ]);
            done();
          });
        });
      });
    });

    it('ignore duplicated likes', function(done) {
      var user = Richard;
      var post = HawkPosts[3];
      var currentCount;
      json('get', endpoint+'/'+post.sid)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        assert(typeof res.body.result.likes === 'object');
        currentCount = res.body.result.likes.count;
        json('post', endpoint+'/'+post.sid+'/like?access_token='+user.accessToken.id)
        .send({userId: user.sid})
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          json('post', endpoint+'/'+post.sid+'/like?access_token='+user.accessToken.id)
          .send({userId: user.sid})
          .expect(200, function(err, res) {
            if (err) { return done(err); }
            json('get', endpoint+'/'+post.sid)
            .expect(200, function(err, res) {
              if (err) { return done(err); }
              res.body.result.likes.count.should.equal(currentCount + 1);
              done();
            });
          });
        });
      });
    });

    it('unlike a post and the count should decrease 1', function(done) {
      var user = Richard;
      var post = HawkPosts[0];
      var currentCount;
      json('post', endpoint+'/'+post.sid+'/like?access_token='+user.accessToken.id)
      .send({userId: user.sid})
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        json('get', endpoint+'/'+post.sid)
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          assert(typeof res.body.result.likes === 'object');
          currentCount = res.body.result.likes.count;
          json('post', endpoint+'/'+post.sid+'/unlike?access_token='+user.accessToken.id)
          .send({userId: user.sid})
          .expect(200, function(err, res) {
            if (err) { return done(err); }
            json('get', endpoint+'/'+post.sid)
            .expect(200, function(err, res) {
              if (err) { return done(err); }
              res.body.result.likes.count.should.equal(currentCount - 1);
              done();
            });
          });
        });
      });
    });

    it('unlike a post by different users', function(done) {
      // We first like a post twice by using different user accounts, then unlike the post twice
      // by using different accounts.
      var user1 = Richard;
      var user2 = Paco;
      var post = HawkPosts[0];
      var currentCount;
      json('post', endpoint+'/'+post.sid+'/like?access_token='+user1.accessToken.id)
      .send({userId: user1.sid})
      .expect(200, function(err, res) {
        json('post', endpoint+'/'+post.sid+'/like?access_token='+user2.accessToken.id)
        .send({userId: user2.sid})
        .expect(200, function(err, res) {
          json('get', endpoint+'/'+post.sid)
          .expect(200, function(err, res) {
            if (err) { return done(err); }
            assert(typeof res.body.result.likes === 'object');
            currentCount = res.body.result.likes.count;
            json('post', endpoint+'/'+post.sid+'/unlike?access_token='+user1.accessToken.id)
            .send({userId: user1.sid})
            .expect(200, function(err, res) {
              if (err) { return done(err); }
              json('post', endpoint+'/'+post.sid+'/unlike?access_token='+user2.accessToken.id)
              .send({userId: user2.sid})
              .expect(200, function(err, res) {
                if (err) { return done(err); }
                json('get', endpoint+'/'+post.sid)
                .expect(200, function(err, res) {
                  if (err) { return done(err); }
                  res.body.result.likes.count.should.equal(currentCount - 2);
                  done();
                });
              });
            });
          });
        });
      });
    });

    it('ignore double unlike', function(done) {
      var user = Richard;
      var post = HawkPosts[0];
      var currentCount;
      json('post', endpoint+'/'+post.sid+'/like?access_token='+user.accessToken.id)
      .send({userId: user.sid})
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        json('get', endpoint+'/'+post.sid)
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          assert(typeof res.body.result.likes === 'object');
          currentCount = res.body.result.likes.count;
          json('post', endpoint+'/'+post.sid+'/unlike?access_token='+user.accessToken.id)
          .send({userId: user.sid})
          .expect(200, function(err, res) {
            if (err) { return done(err); }
            json('post', endpoint+'/'+post.sid+'/unlike?access_token='+user.accessToken.id)
            .send({userId: user.sid})
            .expect(200, function(err, res) {
              if (err) { return done(err); }
              json('get', endpoint+'/'+post.sid)
              .expect(200, function(err, res) {
                if (err) { return done(err); }
                res.body.result.likes.count.should.equal(currentCount - 1);
                done();
              });
            });
          });
        });
      });
    });
  });
});
