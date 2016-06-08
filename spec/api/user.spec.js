/* jshint camelcase: false */
'use strict';
var app = require('../../server/server');
var Loader = require('../utils/fixtureLoader');
var request = require('supertest');
var should = require('should');
var assert = require('assert');
var async = require('async');
var fs = require('fs');

var apiVersion = require('../../package.json').version.split('.').shift();
var endpointRoot = '/api' + (apiVersion > 0 ? '/v' + apiVersion :  '');
var endpoint = endpointRoot + '/users';
var User, Post;

function json(verb, url) {
  return request(app)[verb](url)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/);
}

describe('REST API endpoint /users', function() {

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
  });

  describe('User creating', function() {
    var user = {
      username: 'Luke Skywalker',
      email: 'foo@bar.com',
      password: 'yoda'
    };

    it('create a new user', function(done) {
      json('post', endpoint)
      .send(user)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.have.property('email', user.email);
        done();
      });
    });

    it('reject user creation of duplicated username', function(done) {
      json('post', endpoint)
      .send({
        username: user.username,
        email: 'foo@bar2.com',
        password: 'yoda2'
      })
      .expect(422, function(err, res) {
        if (err) { return done(err); }
        done();
      });
    });

    it('reject user creation of duplicated email', function(done) {
      json('post', endpoint)
      .send({
        username: 'John',
        email: user.email,
        password: 'yoda3'
      })
      .expect(422, function(err, res) {
        if (err) { return done(err); }
        done();
      });
    });
  });

  describe('User login/out', function() {
    var user = {
      username: 'FooFoo',
      email: 'foo@foo.com',
      password: 'foo'
    };
    before(function(done) {
      User.create({username: user.username, email: user.email, password: user.password}, function(err, newUser) {
        if (err) { return done(err); }
        assert(newUser.sid);
        assert.equal(newUser.email, user.email);
        user.sid = newUser.sid;
        done();
      });
    });

    it('login a user by providing valid credentials', function(done) {
      json('post', endpoint + '/login')
      .send({
        email: user.email,
        password: user.password
      })
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.have.property('id');
        res.body.should.have.property('userId', user.sid);
        user.accessToken = res.body;
        done();
      });
    });

    it('logout a user by providing access token', function(done) {
      json('post', endpoint+'/logout?access_token='+user.accessToken.id)
      .expect(204, function(err, res) {
        if (err) { return done(err); }
        done();
      });
    });
  });

  describe('User accessing', function() {
    var Hawk = {};
    var Eric = {};
    var HawkPosts = [];

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
          loadEric: function(callback) {
            loadUserAndPosts({ email: 'sunright0414@gmail.com', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              Eric = result.user;
              callback();
            });
          }
        }, function(err) {
          if (err) { return done(err); }
          done();
        });
      });
    });

    it('return a user by providing valid user id and valid access token', function(done) {
      var user = Hawk;
      json('get', endpoint+'/'+user.sid+'?access_token='+user.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.have.property('email', user.email);
        done();
      });
    });

    it('return a user by providing id param as a literal and a valid access token', function(done) {
      var user = Hawk;
      json('get', endpoint+'/me?access_token='+user.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.have.property('email', user.email);
        done();
      });
    });

    it('not return a user by providing mismatching userId and token', function(done) {
      var user = Hawk;
      json('get', endpoint+'/1234?access_token='+user.accessToken.id)
      .expect(401, function(err, res) {
        if (err) { return done(err); }
        done();
      });
    });

    it('return a list of posts', function(done) {
      var user = Hawk;
      var posts = HawkPosts;
      json('get', endpoint+'/me/posts?access_token='+user.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.be.instanceof(Array).with.lengthOf(posts.length);
        res.body.should.containDeep([{ownerId: user.sid}]);
        done();
      });
    });

    it('upload user profile photo', function(done) {
      var user = Hawk;
      var image = fs.readFileSync(__dirname+'/fixtures/user_profile_photo.jpeg').toString('base64');
      json('post', endpoint+'/'+user.sid+'/photo?access_token='+user.accessToken.id)
      .send({
        image: image
      })
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.have.property('status', 'success');
        done();
      });
    });

    it('change user profile photo', function(done) {
      var user = Eric;
      var image = fs.readFileSync(__dirname+'/fixtures/user_profile_photo.jpeg').toString('base64');
      json('post', endpoint+'/'+user.sid+'/photo?access_token='+user.accessToken.id)
      .send({
        image: image
      })
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.have.property('status', 'success');
        json('get', endpoint+'/'+user.sid+'/profile?access_token='+user.accessToken.id)
        .expect(200, function(err, res) {
          res.body.profile.should.have.property('profilePhotoUrl');
          res.body.profile.profilePhotoUrl.should.match(/profile_2.jpg$/);
          done();
        });
      });
    });
  });

  describe('User following', function() {
    var follower = {
      username: 'boy',
      email: 'boy@foo.com',
      password: 'xxxx'
    };
    var followee = {
      username: 'girl',
      email: 'girl@foo.com',
      password: 'xxxx'
    };
    var followee2 = {
      username: 'girl2',
      email: 'girl2@foo.com',
      password: 'xxxx'
    };
    before(function(done) {
      async.each([follower, followee, followee2], function(user, callback) {
        createUserAndLogin(user, function(err, result) {
          if (err) { return callback(err); }
          user.sid = result.sid;
          user.accessToken = result.accessToken;
          callback();
        });
      }, function(err) {
        if (err) { return done(err); }
        done();
      });
    });

    it('follow a user', function(done) {
      json('post', endpoint+'/'+follower.sid+'/follow/'+followee.sid+'?access_token='+follower.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        done();
      });
    });

    it('ignore duplicated following', function(done) {
      json('post', endpoint+'/'+follower.sid+'/follow/'+followee.sid+'?access_token='+follower.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        json('post', endpoint+'/'+follower.sid+'/follow/'+followee.sid+'?access_token='+follower.accessToken.id)
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          done();
        });
      });
    });

    it('unfollow a user', function(done) {
      json('post', endpoint+'/'+follower.sid+'/unfollow/'+followee.sid+'?access_token='+follower.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        done();
      });
    });

    it('ignore double unfollowing', function(done) {
      json('post', endpoint+'/'+follower.sid+'/unfollow/'+followee.sid+'?access_token='+follower.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        json('post', endpoint+'/'+follower.sid+'/unfollow/'+followee.sid+'?access_token='+follower.accessToken.id)
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          done();
        });
      });
    });

    it('return 404 if the followee does not exist', function(done) {
      json('post', endpoint+'/'+follower.sid+'/follow/123?access_token='+follower.accessToken.id)
      .expect(404, function(err, res) {
        if (err) { return done(err); }
        done();
      });
    });

    it('get follower list of a given user', function(done) {
      json('post', endpoint+'/'+follower.sid+'/follow/'+followee.sid+'?access_token='+follower.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        json('post', endpoint+'/'+followee2.sid+'/follow/'+followee.sid+'?access_token='+followee2.accessToken.id)
        .expect(200, function(err, res) {
          json('get', endpoint+'/'+followee.sid+'/followers?access_token='+followee.accessToken.id)
          .expect(200, function(err, res) {
            if (err) { return done(err); }
            res.body.result.should.containDeep([ { followerId: follower.sid }, { followerId: followee2.sid } ]);
            done();
          });
        });
      });
    });

    it('get following list of a given user', function(done) {
      json('post', endpoint+'/'+follower.sid+'/follow/'+followee.sid+'?access_token='+follower.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        json('post', endpoint+'/'+follower.sid+'/follow/'+followee2.sid+'?access_token='+follower.accessToken.id)
        .expect(200, function(err, res) {
          json('get', endpoint+'/'+follower.sid+'/following?access_token='+follower.accessToken.id)
          .expect(200, function(err, res) {
            if (err) { return done(err); }
            res.body.result.should.containDeep([ { followeeId: followee.sid }, { followeeId: followee2.sid } ]);
            done();
          });
        });
      });
    });

    it('get following list of a given user (2)', function(done) {
      json('get', endpoint+'/'+followee.sid+'/following?access_token='+follower.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.result.should.be.an.instanceof(Array).and.have.lengthOf(0);
        done();
      });
    });
  });

  describe('User editing', function() {
    var user = {
      username: 'xxx',
      email: 'xxx@foo.com',
      password: 'xxxx'
    };
    before(function(done) {
      createUserAndLogin(user, function(err, result) {
        if (err) { return done(err); }
        user.sid = result.sid;
        user.accessToken = result.accessToken;
        done();
      });
    });

    it('update a user', function(done) {
      var newUsername = 'Eric';
      var profilePhotoUrl = 'http://www.foo.com/';
      json('put', endpoint+'/me?access_token='+user.accessToken.id)
      .send({
        username: newUsername,
        profilePhotoUrl: profilePhotoUrl
      })
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.have.property('username', newUsername);
        res.body.should.have.property('profilePhotoUrl', profilePhotoUrl);
        done();
      });
    });

    it('delete a user', function(done) {
      json('delete', endpoint+'/me?access_token='+user.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        done();
      });
    });
  });

  describe('User changing password', function() {
    var user = {
      username: 'Ben',
      email: 'ben@foo.com',
      password: 'password1'
    };
    var newPassword = 'password2';
    before(function(done) {
      createUserAndLogin(user, function(err, result) {
        if (err) { return done(err); }
        user.sid = result.sid;
        user.accessToken = result.accessToken;
        done();
      });
    });

    it('change password', function(done) {
      json('post', endpoint+'/me/changePassword?access_token='+user.accessToken.id)
      .send({
        oldPassword: user.password,
        newPassword: newPassword
      })
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        json('post', endpoint + '/login')
        .send({
          email: user.email,
          password: newPassword
        })
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          done();
        });
      });
    });

    it('without providing old password', function(done) {
      json('post', endpoint+'/me/changePassword?access_token='+user.accessToken.id)
      .send({
        newPassword: 'new pasword'
      })
      .expect(400, function(err, res) {
        if (err) { return done(err); }
        done();
      });
    });

    it('without providing new password', function(done) {
      json('post', endpoint+'/me/changePassword?access_token='+user.accessToken.id)
      .send({
        oldPassword: newPassword
      })
      .expect(400, function(err, res) {
        if (err) { return done(err); }
        done();
      });
    });


    it('change password with incorrect old password', function(done) {
      json('post', endpoint+'/me/changePassword?access_token='+user.accessToken.id)
      .send({
        oldPassword: 'xxxx',
        newPassword: 'new pasword'
      })
      .expect(401, function(err, res) {
        if (err) { return done(err); }
        done();
      });
    });
  });

  describe('User feedback', function() {
    var user = {
      username: 'Johnny',
      email: 'johnny@foo.com',
      password: 'xxxxx'
    };
    before(function(done) {
      createUserAndLogin(user, function(err, result) {
        if (err) { return done(err); }
        user.sid = result.sid;
        user.accessToken = result.accessToken;
        done();
      });
    });

    it('send feedback', function(done) {
      json('post', endpoint+'/'+user.sid+'/feedback?access_token='+user.accessToken.id)
      .send({
        appVersion: '2.8.0',
        device: {
          name: 'iPhone 6',
          os: 'iOS 8.0'
        },
        message: 'hihi'
      })
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        done();
      });
    });
  });
});
