/* jshint camelcase: false */
'use strict';
var app = require('../../server/server');
var request = require('supertest');
var should = require('should');
var assert = require('assert');
var async = require('async');

var apiVersion = require('../../package.json').version.split('.').shift();
var endpointRoot = '/api' + (apiVersion > 0 ? '/v' + apiVersion : '');
var endpoint = endpointRoot + '/search';
var User, Post, Follow, Like;

function json(verb, url) {
  return request(app)[verb](url)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/);
}

describe('REST API endpoint /search', function() {

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

  describe('/search/recent', function() {
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

    it('search for recent posts', function(done) {
      json('post', endpoint+'/recent')
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        console.log(JSON.stringify(res.body));
        var i;
        for (i = 0; i < res.body.posts.length; i++) {
          console.log(res.body.posts[i].sid+' '+res.body.posts[i].created);
        }
        done();
      });
    });
  });
});
