/* jshint camelcase: false */
'use strict';
var app = require('../../server/server');
var request = require('supertest');
var should = require('should');
var assert = require('assert');
var async = require('async');
var zlib = require('zlib');

var apiVersion = require('../../package.json').version.split('.').shift();
var endpointRoot = '/api' + (apiVersion > 0 ? '/v' + apiVersion :  '');
var endpoint = endpointRoot + '/posts';
var User, Post, File;

function json(verb, url, contentType) {
  return request(app)[verb](url)
    .set('Content-Type', contentType ? contentType : 'application/json')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/);
}

describe('Posts - integration', function() {

  var user = {
    username: 'Zeus Chang',
    email: 'zeus.chang@toppano.in',
    password: 'password'
  };
  var anotherUser = {
    username: 'Eric Chang',
    email: 'eric.chang@toppano.in',
    password: 'xxx'
  };

  before(function(done) {
    User = app.models.user;
    Post = app.models.post;
    File = app.models.file;

    async.each([user, anotherUser], function(item, callback) {
      User.create(item, function(err, newUser) {
        if (err) { return callback(err); }
        assert(newUser.sid);
        assert.equal(newUser.email, item.email);
        item.sid = newUser.sid;
        User.login({email: item.email, password: item.password}, function(err, accessToken) {
          if (err) { return callback(err); }
          assert(accessToken.userId);
          assert(accessToken.id);
          item.accessToken = accessToken;
          callback();
        });
      });
    }, function(err) {
      if (err) { return done(err); }
      done();
    });
  });

  describe('Post - like', function() {
    var post = {
      message: 'Paine granite towers in Torres del Paine National Park.',
      address: 'I do not know where it is.'
    };

    before(function(done) {
      post.ownerId = user.sid;
      Post.create(post, function(err, newPost) {
        if (err) { return done(err); }
        post.sid = newPost.sid;
        done();
      });
    });

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

    it('like a post and the count should increase 1', function(done) {
      var currentCount;
      json('get', endpoint+'/'+post.sid)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        assert(typeof res.body.likes === 'object');
        currentCount = res.body.likes.count;
        json('post', endpoint+'/'+post.sid+'/like?access_token='+user.accessToken.id)
        .send({userId: user.sid})
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          json('get', endpoint+'/'+post.sid)
          .expect(200, function(err, res) {
            if (err) { return done(err); }
            res.body.likes.should.have.property('count', currentCount + 1);
            done();
          });
        });
      });
    });

    it('like a post by different users', function(done) {
      var currentCount;
      json('get', endpoint+'/'+post.sid)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        assert(typeof res.body.likes === 'object');
        currentCount = res.body.likes.count;
        json('post', endpoint+'/'+post.sid+'/like?access_token='+user.accessToken.id)
        .send({userId: user.sid})
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          json('post', endpoint+'/'+post.sid+'/like?access_token='+anotherUser.accessToken.id)
          .send({userId: anotherUser.sid})
          .expect(200, function(err, res) {
            if (err) { return done(err); }
            json('get', endpoint+'/'+post.sid)
            .expect(200, function(err, res) {
              if (err) { return done(err); }
              res.body.likes.count.should.equal(currentCount + 2);
              done();
            });
          });
        });
      });
    });

    it('retrun the liked user list of a given post', function(done) {
      json('post', endpoint+'/'+post.sid+'/like?access_token='+user.accessToken.id)
      .send({userId: user.sid})
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        json('post', endpoint+'/'+post.sid+'/like?access_token='+anotherUser.accessToken.id)
        .send({userId: anotherUser.sid})
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          json('get', endpoint+'/'+post.sid+'/likes?access_token='+user.accessToken.id)
          .expect(200, function(err, res) {
            if (err) { return done(err); }
            console.log(JSON.stringify(res.body));
            done();
          });
        });
      });
    });

    it('ignore duplicated likes', function(done) {
      var currentCount;
      json('get', endpoint+'/'+post.sid)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        assert(typeof res.body.likes === 'object');
        currentCount = res.body.likes.count;
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
              res.body.likes.count.should.equal(currentCount + 1);
              done();
            });
          });
        });
      });
    });

    it('unlike a post and the count should decrease 1', function(done) {
      var currentCount;
      json('post', endpoint+'/'+post.sid+'/like?access_token='+user.accessToken.id)
      .send({userId: user.sid})
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        json('get', endpoint+'/'+post.sid)
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          assert(typeof res.body.likes === 'object');
          currentCount = res.body.likes.count;
          json('post', endpoint+'/'+post.sid+'/unlike?access_token='+user.accessToken.id)
          .send({userId: user.sid})
          .expect(200, function(err, res) {
            if (err) { return done(err); }
            json('get', endpoint+'/'+post.sid)
            .expect(200, function(err, res) {
              if (err) { return done(err); }
              res.body.likes.count.should.equal(currentCount - 1);
              done();
            });
          });
        });
      });
    });

    it('unlike a post by different users', function(done) {
      // We first like a post twice by using different user accounts, then unlike the post twice
      // by using different accounts.
      var currentCount;
      json('post', endpoint+'/'+post.sid+'/like?access_token='+user.accessToken.id)
      .send({userId: user.sid})
      .expect(200, function(err, res) {
        json('post', endpoint+'/'+post.sid+'/like?access_token='+anotherUser.accessToken.id)
        .send({userId: anotherUser.sid})
        .expect(200, function(err, res) {
          json('get', endpoint+'/'+post.sid)
          .expect(200, function(err, res) {
            if (err) { return done(err); }
            assert(typeof res.body.likes === 'object');
            currentCount = res.body.likes.count;
            json('post', endpoint+'/'+post.sid+'/unlike?access_token='+user.accessToken.id)
            .send({userId: user.sid})
            .expect(200, function(err, res) {
              if (err) { return done(err); }
              json('post', endpoint+'/'+post.sid+'/unlike?access_token='+anotherUser.accessToken.id)
              .send({userId: anotherUser.sid})
              .expect(200, function(err, res) {
                if (err) { return done(err); }
                json('get', endpoint+'/'+post.sid)
                .expect(200, function(err, res) {
                  if (err) { return done(err); }
                  res.body.likes.count.should.equal(currentCount - 2);
                  done();
                });
              });
            });
          });
        });
      });
    });

    it('ignore double unlike', function(done) {
      var currentCount;
      json('post', endpoint+'/'+post.sid+'/like?access_token='+user.accessToken.id)
      .send({userId: user.sid})
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        json('get', endpoint+'/'+post.sid)
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          assert(typeof res.body.likes === 'object');
          currentCount = res.body.likes.count;
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
                res.body.likes.count.should.equal(currentCount - 1);
                done();
              });
            });
          });
        });
      });
    });
  });
});
