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
var User, Post, File;

function json(verb, url, contentType) {
  return request(app)[verb](url)
    .set('Content-Type', contentType ? contentType : 'application/json')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/);
}

describe('REST API endpoint /post', function() {

  describe('Post - CRUD', function() {
    var user = {};
    var posts = [];

    before(function(done) {
      var loader = new Loader(app, __dirname + '/fixtures');
      loader.reset(function(err) {
        if (err) { throw new Error(err); }
        var User = app.models.user;
        var Post = app.models.post;
        User.find({ where: { email: 'hawk.lin@toppano.in' } }, function(err, result) {
          if (err) { return done(err); }
          assert(result.length !== 0);
          user = result[0];
          User.login({ email: user.email, password: 'verpix' }, function(err, accessToken) {
            if (err) { return done(err); }
            assert(accessToken.userId);
            assert(accessToken.id);
            user.accessToken = accessToken;
            Post.find({ where: { ownerId: user.sid } }, function(err, result) {
              if (err) { return done(err); }
              posts = result;
              done();
            });
          });
        });
      });
    });

    it('create a new post for panophoto', function(done) {
      json('post', endpoint+'/panophoto?access_token='+user.accessToken.id, 'multipart/form-data')
      .field('caption', 'test')
      .field('width', '8192')
      .field('height', '4096')
      .field('thumbLat', '30')
      .field('thumbLng', '90')
      .field('locationName', 'Home Sweet Home')
      .field('locationLat', '25.05511')
      .field('locationLng', '121.61171')
      .attach('thumbnail', __dirname+'/fixtures/1_thumb.jpg')
      .attach('image', __dirname+'/fixtures/1.jpg.zip')
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.result.should.have.property('postId');
        res.body.result.should.have.property('thumbnail');
        done();
      });
    });

    it('return a post by providing valid post id', function(done) {
      var post = posts[0];
      json('get', endpoint+'/'+post.sid)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.result.should.have.property('created');
        res.body.result.should.have.property('modified');
        res.body.result.should.have.property('mediaType');
        res.body.result.should.have.property('media');
        res.body.result.should.have.property('caption');
        res.body.result.should.have.property('ownerId', user.sid);
        res.body.result.should.have.property('owner');
        res.body.result.should.have.property('likes');
        res.body.result.likes.should.have.properties({
          count: 0,
          isLiked: false
        });
        done();
      });
    });

    it('update post caption', function(done) {
      var post = posts[0];
      var newCaption = 'It just a museum.';
      json('put', endpoint+'/'+post.sid+'?access_token='+user.accessToken.id)
      .send({
        caption: newCaption
      })
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.have.properties({
          caption: newCaption,
          ownerId: user.sid
        });
        done();
      });
    });

    it('delete a post', function(done) {
      var post = posts[0];
      json('delete', endpoint+'/'+post.sid+'?access_token='+user.accessToken.id)
      .expect(200, function(err, res) {
        done(err);
      });
    });
  });

  describe('Post - like', function() {
    var user = {};
    var posts = [];

    before(function(done) {
      var loader = new Loader(app, __dirname + '/fixtures');
      loader.reset(function(err) {
        if (err) { throw new Error(err); }
        var User = app.models.user;
        var Post = app.models.post;
        User.find({ where: { email: 'hawk.lin@toppano.in' } }, function(err, result) {
          if (err) { return done(err); }
          assert(result.length !== 0);
          user = result[0];
          User.login({ email: user.email, password: 'verpix' }, function(err, accessToken) {
            if (err) { return done(err); }
            assert(accessToken.userId);
            assert(accessToken.id);
            user.accessToken = accessToken;
            Post.find({ where: { ownerId: user.sid } }, function(err, result) {
              if (err) { return done(err); }
              posts = result;
              done();
            });
          });
        });
      });
    });

    it('like a post', function(done) {
      var post = posts[0];
      json('post', endpoint+'/'+post.sid+'/like?access_token='+user.accessToken.id)
      .send({userId: user.sid})
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        done();
      });
    });

    it('return 400 if request body does not contain userId when like a post', function(done) {
      var post = posts[0];
      json('post', endpoint+'/'+post.sid+'/like?access_token='+user.accessToken.id)
      .expect(400, function(err, res) {
        res.body.error.should.have.property('message', 'Missing property: userId');
        done(err);
      });
    });

    it('return 404 when like a post that does not exist', function(done) {
      json('post', endpoint+'/123/like?access_token='+user.accessToken.id)
      .send({userId: user.sid})
      .expect(404, function(err, res) {
        done(err);
      });
    });

    it('unlike a post', function(done) {
      var post = posts[0];
      json('post', endpoint+'/'+post.sid+'/unlike?access_token='+user.accessToken.id)
      .send({userId: user.sid})
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        done();
      });
    });

    it('return 400 if request body does not contain userId when unlike a post', function(done) {
      var post = posts[0];
      json('post', endpoint+'/'+post.sid+'/unlike?access_token='+user.accessToken.id)
      .expect(400, function(err, res) {
        res.body.error.should.have.property('message', 'Missing property: userId');
        done(err);
      });
    });

    it('return 404 when unlike a post that does not exist', function(done) {
      json('post', endpoint+'/123/unlike?access_token='+user.accessToken.id)
      .send({userId: user.sid})
      .expect(404, function(err, res) {
        done(err);
      });
    });
  });
});
