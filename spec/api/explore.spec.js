/* jshint camelcase: false */
'use strict';
var app = require('../../server/server');
var Loader = require('../utils/fixtureLoader');
var request = require('supertest');
var moment = require('moment');
var should = require('should');
var assert = require('assert');
var async = require('async');

var apiVersion = require('../../package.json').version.split('.').shift();
var endpointRoot = '/api' + (apiVersion > 0 ? '/v' + apiVersion : '');
var endpoint = endpointRoot + '/explore';
var User, Post, Follow, Like;

function json(verb, url) {
  return request(app)[verb](url)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/);
}

describe.skip('REST API endpoint /explore', function() {

  function loadUserAndLogin(cred, callback) {
    assert(cred.email);
    assert(cred.password);
    var User = app.models.user;
    var user = {};
    User.find({ where: { email: cred.email } }, function(err, result) {
      if (err) { return callback(err); }
      assert(result.length !== 0);
      user = result[0];
      User.login({ email: user.email, password: cred.password }, function(err, accessToken) {
        if (err) { return callback(err); }
        assert(accessToken.userId);
        assert(accessToken.id);
        user.accessToken = accessToken;
        callback(null, user);
      });
    });
  }

  describe('/explore/recent', function() {
    var Richard = {};
    var allPosts = [];

    before(function(done) {
      var loader = new Loader(app, __dirname + '/fixtures');
      loader.reset(function(err) {
        if (err) { throw new Error(err); }
        async.parallel({
          loadRichard: function(callback) {
            loadUserAndLogin({ email: 'richard.chou@toppano.in', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              Richard = result;
              callback();
            });
          },
          loadAllPosts: function(callback) {
            var Post = app.models.post;
            Post.find({}, function(err, posts) {
              if (err) { return callback(err); }
              assert(posts.length === 22);
              allPosts = posts.sort(descending);
              callback();
            });

            function descending(a, b) {
              if (a.sid > b.sid)
                return -1;
              else if (a.sid < b.sid)
                return 1;
              else
                return 0;
            }
          }
        }, function(err) {
          if (err) { return done(err); }
          done();
        });
      });
    });

    it('query with default parameters', function(done) {
      var me = Richard;
      json('post', endpoint+'/recent?access_token='+me.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        var postsWithoutMine = allPosts.filter(function(post) { return post.ownerId !== me.sid; });
        res.body.result.should.have.property('page');
        res.body.result.should.have.property('feed');
        res.body.result.page.should.have.properties({
          hasNextPage: true,
          count: 12
        });

        var postCount = res.body.result.page.count;
        res.body.result.feed.should.be.an.instanceOf(Array).and.have.lengthOf(postCount);
        res.body.result.page.start.should.equal(postsWithoutMine[0].sid);
        res.body.result.feed[0].sid.should.equal(postsWithoutMine[0].sid);
        res.body.result.page.end.should.equal(postsWithoutMine[ postCount - 1].sid);
        res.body.result.feed[postCount - 1].sid.should.equal(postsWithoutMine[ postCount - 1].sid);
        done();
      });
    });

    it('query with custom limit', function(done) {
      var me = Richard;
      var queryLimit = 6; // Show six post per page
      json('post', endpoint+'/recent?access_token='+me.accessToken.id)
      .send({ limit: queryLimit })
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        var postsWithoutMine = allPosts.filter(function(post) { return post.ownerId !== me.sid; });
        res.body.result.should.have.property('page');
        res.body.result.should.have.property('feed');
        res.body.result.page.should.have.properties({
          hasNextPage: true,
          count: queryLimit
        });

        var postCount = res.body.result.page.count;
        res.body.result.feed.should.be.an.instanceOf(Array).and.have.lengthOf(postCount);
        res.body.result.page.start.should.equal(postsWithoutMine[0].sid);
        res.body.result.feed[0].sid.should.equal(postsWithoutMine[0].sid);
        res.body.result.page.end.should.equal(postsWithoutMine[ postCount - 1].sid);
        res.body.result.feed[postCount - 1].sid.should.equal(postsWithoutMine[ postCount - 1].sid);
        done();
      });
    });

    it('query two pages', function(done) {
      var me = Richard;
      json('post', endpoint+'/recent?access_token='+me.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        var postsWithoutMine = allPosts.filter(function(post) { return post.ownerId !== me.sid; });
        var postsWithoutFirstPage = postsWithoutMine.filter(function(post) { return post.sid < res.body.result.page.end; });
        // Query the second page
        json('post', endpoint+'/recent?access_token='+me.accessToken.id)
        .send({
          where: {
            sid: { lt: res.body.result.page.end }
          }
        })
        .expect(200, function(err, res) {
          var secondPageCount = postsWithoutFirstPage.length >= 12 ? 12 : postsWithoutFirstPage.length;
          res.body.result.should.have.property('page');
          res.body.result.should.have.property('feed');
          res.body.result.page.should.have.properties({
            hasNextPage: postsWithoutFirstPage.length > 12 ? true : false,
            count: secondPageCount
          });
          res.body.result.feed.should.be.an.instanceOf(Array).and.have.lengthOf(secondPageCount);
          res.body.result.page.start.should.equal(postsWithoutFirstPage[0].sid);
          res.body.result.feed[0].sid.should.equal(postsWithoutFirstPage[0].sid);
          res.body.result.page.end.should.equal(postsWithoutFirstPage[ secondPageCount - 1].sid);
          res.body.result.feed[secondPageCount - 1].sid.should.equal(postsWithoutFirstPage[ secondPageCount - 1].sid);
          done();
        });
      });
    });

    it('query two pages with custom limit', function(done) {
      var me = Richard;
      var queryLimit = 6;
      json('post', endpoint+'/recent?access_token='+me.accessToken.id)
      .send({ limit: queryLimit })
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        var postsWithoutMine = allPosts.filter(function(post) { return post.ownerId !== me.sid; });
        var postsWithoutFirstPage = postsWithoutMine.filter(function(post) { return post.sid < res.body.result.page.end; });
        // Query the second page
        json('post', endpoint+'/recent?access_token='+me.accessToken.id)
        .send({
          where: {
            sid: { lt: res.body.result.page.end }
          },
          limit: queryLimit
        })
        .expect(200, function(err, res) {
          var secondPageCount = postsWithoutFirstPage.length >= queryLimit ? queryLimit : postsWithoutFirstPage.length;
          res.body.result.should.have.property('page');
          res.body.result.should.have.property('feed');
          res.body.result.page.should.have.properties({
            hasNextPage: postsWithoutFirstPage.length > queryLimit ? true : false,
            count: secondPageCount
          });
          res.body.result.feed.should.be.an.instanceOf(Array).and.have.lengthOf(secondPageCount);
          res.body.result.page.start.should.equal(postsWithoutFirstPage[0].sid);
          res.body.result.feed[0].sid.should.equal(postsWithoutFirstPage[0].sid);
          res.body.result.page.end.should.equal(postsWithoutFirstPage[ secondPageCount - 1].sid);
          res.body.result.feed[secondPageCount - 1].sid.should.equal(postsWithoutFirstPage[ secondPageCount - 1].sid);
          done();
        });
      });
    });
  });
});
