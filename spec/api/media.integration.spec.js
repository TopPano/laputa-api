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
var endpoint = endpointRoot + '/media';
var User, Media;

function json(verb, url, contentType) {
  return request(app)[verb](url)
    .set('Content-Type', contentType ? contentType : 'application/json')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/);
}

describe('Media - integration:', function() {

  function loadUserAndMedia(cred, callback) {
    assert(cred.email);
    assert(cred.password);
    var User = app.models.user;
    var Media = app.models.media;
    var user = {};
    var media = [];
    User.find({ where: { email: cred.email } }, function(err, result) {
      if (err) { return callback(err); }
      assert(result.length !== 0);
      user = result[0];
      User.login({ email: user.email, password: cred.password }, function(err, accessToken) {
        if (err) { return callback(err); }
        assert(accessToken.userId);
        assert(accessToken.id);
        user.accessToken = accessToken;
        Media.find({ where: { ownerId: user.sid } }, function(err, result) {
          if (err) { return callback(err); }
          media = result;
          callback(null, { user: user, media: media });
        });
      });
    });
  }

  describe('Media - like:', function() {
    var Hawk = {};
    var Richard = {};
    var Paco = {};
    var HawkMedia = [];
    var RichardMedia = [];
    var PacoMedia = [];

    before(function(done) {
      var loader = new Loader(app, __dirname + '/fixtures');
      var Follow = app.models.follow;
      loader.reset(function(err) {
        if (err) { throw new Error(err); }
        async.parallel({
          loadHawk: function(callback) {
            loadUserAndMedia({ email: 'hawk.lin@toppano.in', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              Hawk = result.user;
              HawkMedia = result.media;
              callback();
            });
          },
          loadRichard: function(callback) {
            loadUserAndMedia({ email: 'richard.chou@toppano.in', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              Richard = result.user;
              RichardMedia = result.media;
              callback();
            });
          },
          loadPaco: function(callback) {
            loadUserAndMedia({ email: 'paco@toppano.in', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              Paco = result.user;
              PacoMedia = result.media;
              callback();
            });
          }
        }, function(err) {
          if (err) { return done(err); }
          // Hawk follows Paco
          Follow.create({followerId: Hawk.sid, followeeId: Paco.sid, followAt: new Date()}, function(err) {
            if (err) { return done(err); }
            done();
          });
        });
      });
    });

    it('like a media and the count should increase 1', function(done) {
      var user = Richard;
      var media = HawkMedia[0];
      var currentCount;
      json('get', endpoint+'/'+media.sid)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        assert(typeof res.body.result.likes === 'object');
        currentCount = res.body.result.likes.count;
        json('post', endpoint+'/'+media.sid+'/like?access_token='+user.accessToken.id)
        .send({userId: user.sid})
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          json('get', endpoint+'/'+media.sid)
          .expect(200, function(err, res) {
            if (err) { return done(err); }
            res.body.result.likes.should.have.property('count', currentCount + 1);
            done();
          });
        });
      });
    });

    it('like a media by different users', function(done) {
      var user1 = Richard;
      var user2 = Paco;
      var media = HawkMedia[1];
      var currentCount;
      json('get', endpoint+'/'+media.sid)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        assert(typeof res.body.result.likes === 'object');
        currentCount = res.body.result.likes.count;
        json('post', endpoint+'/'+media.sid+'/like?access_token='+user1.accessToken.id)
        .send({userId: user1.sid})
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          json('post', endpoint+'/'+media.sid+'/like?access_token='+user2.accessToken.id)
          .send({userId: user2.sid})
          .expect(200, function(err, res) {
            if (err) { return done(err); }
            json('get', endpoint+'/'+media.sid)
            .expect(200, function(err, res) {
              if (err) { return done(err); }
              res.body.result.likes.count.should.equal(currentCount + 2);
              done();
            });
          });
        });
      });
    });

    it('retrun the liked user list of a given media', function(done) {
      var user1 = Richard;
      var user2 = Paco;
      var mediaOwner = Hawk;
      var media = HawkMedia[2];
      json('post', endpoint+'/'+media.sid+'/like?access_token='+user1.accessToken.id)
      .send({userId: user1.sid})
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        json('post', endpoint+'/'+media.sid+'/like?access_token='+user2.accessToken.id)
        .send({userId: user2.sid})
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          json('get', endpoint+'/'+media.sid+'/likes?access_token='+mediaOwner.accessToken.id)
          .expect(200, function(err, res) {
            if (err) { return done(err); }
            res.body.result.should.containDeep([
              {
                userId: user1.sid,
                isFollowing: false
              },
              {
                userId: user2.sid,
                isFollowing: true
              }
            ]);
            done();
          });
        });
      });
    });

    it('ignore duplicated likes', function(done) {
      var user = Richard;
      var media = HawkMedia[3];
      var currentCount;
      json('get', endpoint+'/'+media.sid)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        assert(typeof res.body.result.likes === 'object');
        currentCount = res.body.result.likes.count;
        json('post', endpoint+'/'+media.sid+'/like?access_token='+user.accessToken.id)
        .send({userId: user.sid})
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          json('post', endpoint+'/'+media.sid+'/like?access_token='+user.accessToken.id)
          .send({userId: user.sid})
          .expect(200, function(err, res) {
            if (err) { return done(err); }
            json('get', endpoint+'/'+media.sid)
            .expect(200, function(err, res) {
              if (err) { return done(err); }
              res.body.result.likes.count.should.equal(currentCount + 1);
              done();
            });
          });
        });
      });
    });

    it('unlike a media and the count should decrease 1', function(done) {
      var user = Richard;
      var media = HawkMedia[0];
      var currentCount;
      json('post', endpoint+'/'+media.sid+'/like?access_token='+user.accessToken.id)
      .send({userId: user.sid})
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        json('get', endpoint+'/'+media.sid)
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          assert(typeof res.body.result.likes === 'object');
          currentCount = res.body.result.likes.count;
          json('post', endpoint+'/'+media.sid+'/unlike?access_token='+user.accessToken.id)
          .send({userId: user.sid})
          .expect(200, function(err, res) {
            if (err) { return done(err); }
            json('get', endpoint+'/'+media.sid)
            .expect(200, function(err, res) {
              if (err) { return done(err); }
              res.body.result.likes.count.should.equal(currentCount - 1);
              done();
            });
          });
        });
      });
    });

    it('unlike a media by different users', function(done) {
      // We first like a media twice by using different user accounts, then unlike the media twice
      // by using different accounts.
      var user1 = Richard;
      var user2 = Paco;
      var media = HawkMedia[0];
      var currentCount;
      json('post', endpoint+'/'+media.sid+'/like?access_token='+user1.accessToken.id)
      .send({userId: user1.sid})
      .expect(200, function(err, res) {
        json('post', endpoint+'/'+media.sid+'/like?access_token='+user2.accessToken.id)
        .send({userId: user2.sid})
        .expect(200, function(err, res) {
          json('get', endpoint+'/'+media.sid)
          .expect(200, function(err, res) {
            if (err) { return done(err); }
            assert(typeof res.body.result.likes === 'object');
            currentCount = res.body.result.likes.count;
            json('post', endpoint+'/'+media.sid+'/unlike?access_token='+user1.accessToken.id)
            .send({userId: user1.sid})
            .expect(200, function(err, res) {
              if (err) { return done(err); }
              json('post', endpoint+'/'+media.sid+'/unlike?access_token='+user2.accessToken.id)
              .send({userId: user2.sid})
              .expect(200, function(err, res) {
                if (err) { return done(err); }
                json('get', endpoint+'/'+media.sid)
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
      var media = HawkMedia[0];
      var currentCount;
      json('post', endpoint+'/'+media.sid+'/like?access_token='+user.accessToken.id)
      .send({userId: user.sid})
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        json('get', endpoint+'/'+media.sid)
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          assert(typeof res.body.result.likes === 'object');
          currentCount = res.body.result.likes.count;
          json('post', endpoint+'/'+media.sid+'/unlike?access_token='+user.accessToken.id)
          .send({userId: user.sid})
          .expect(200, function(err, res) {
            if (err) { return done(err); }
            json('post', endpoint+'/'+media.sid+'/unlike?access_token='+user.accessToken.id)
            .send({userId: user.sid})
            .expect(200, function(err, res) {
              if (err) { return done(err); }
              json('get', endpoint+'/'+media.sid)
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
