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
var User, Media, Follow, Like;

function json(verb, url) {
  return request(app)[verb](url)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/);
}

describe('Users - integration:', function() {

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
    Media = app.models.media;
    Follow = app.models.follow;
    Like = app.models.like;
  });

  describe.skip('User querying:', function() {
    var Richard = {};
    var Hawk = {};
    var Paco = {};
    var Eric = {};
    var RichardMedia = [];
    var HawkMedia = [];
    var PacoMedia = [];
    var EricMedia = [];

    before(function(done) {
      var loader = new Loader(app, __dirname + '/fixtures');
      loader.reset(function(err) {
        if (err) { throw new Error(err); }
        async.parallel({
          loadRichard: function(callback) {
            loadUserAndMedia({ email: 'richard.chou@toppano.in', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              Richard = result.user;
              RichardMedia = result.media;
              callback();
            });
          },
          loadHawk: function(callback) {
            loadUserAndMedia({ email: 'hawk.lin@toppano.in', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              Hawk = result.user;
              HawkMedia = result.media;
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
          },
          loadEric: function(callback) {
            loadUserAndMedia({ email: 'sunright0414@gmail.com', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              Eric = result.user;
              EricMedia = result.media;
              callback();
            });
          }
        }, function(err) {
          if (err) { return done(err); }
          async.parallel({
            // Richard
            // - like Hawk's media 7
            // - follow Hawk, Paco, and Eric
            RichardLikesHawkMedia7: function(callback) {
              Like.create({ mediaId: HawkMedia[7].sid, userId: Richard.sid }, function(err) {
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
            // - like Hawk's media 7
            // - follow Hawk
            PacoLikesHawkMedia7: function(callback) {
              Like.create({ mediaId: HawkMedia[7].sid, userId: Paco.sid }, function(err) {
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

    it.skip('query media from following users (with default limit)', function(done) {
      var me = Paco;
      var totalMediaCount = HawkMedia.length;
      assert(totalMediaCount === 8);
      json('post', endpoint+'/'+me.sid+'/query?access_token='+me.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        assert(res.body.result);
        res.body.result.should.have.property('page');
        res.body.result.page.should.have.property('hasNextPage', false);
        res.body.result.page.should.have.property('count', totalMediaCount);

        res.body.result.should.have.property('feed');
        res.body.result.feed.should.be.instanceof(Array).with.lengthOf(totalMediaCount);
        res.body.result.feed[0].likes.should.have.properties({ count: 2, isLiked: true });
        res.body.result.feed[1].likes.should.have.properties({ count: 0, isLiked: false });
        done();
      });
    });

    it.skip('query media from following users (with default limit) (2)', function(done) {
      var me = Richard;
      var totalMediaCount = HawkMedia.length + PacoMedia.length + EricMedia.length;
      assert(totalMediaCount > 12);
      json('post', endpoint+'/'+me.sid+'/query?access_token='+me.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        assert(res.body.result);
        var totalMedia = HawkMedia.length + PacoMedia.length;
        res.body.result.should.have.property('page');
        res.body.result.page.should.have.property('hasNextPage', true);
        res.body.result.page.should.have.property('count', 12);

        res.body.result.should.have.property('feed');
        res.body.result.feed.should.be.instanceof(Array).with.lengthOf(12);
        done();
      });
    });

    it.skip('query media from following users (with custom limit)', function(done) {
      var me = Paco;
      var queryLimit = 1; // Show one media per page
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

    it.skip('query media from following users (with custom limit) (2)', function(done) {
      var me = Richard;
      var queryLimit = 3; // Show three media per page
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
      var queryLimit = 7; // Show three media per page
      var totalMediaCount = HawkMedia.length + PacoMedia.length;
      assert(totalMediaCount > 7 && totalMediaCount < 14); // to test the situation that total media can be
                                                         // covered by two pages
      var firstPageCount = queryLimit;  // the first batch of media, should be the same number of query limit
                                        // if the total media number is greater than the limit
      var secondPageCount = totalMediaCount - queryLimit; // the rest media
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
      var queryLimit = 3; // Show three media per page
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
            res.body.error.should.have.property('message', 'invalid query operator');
            done();
          });
        });
      });
    });

    it('return 400 for invalid where query (invalid query operator type)', function(done) {
      var me = Richard;
      var queryLimit = 3; // Show three media per page
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
          res.body.error.should.have.property('message', 'invalid query operator');
          done();
        });
      });
    });

    it('return 400 for invalid where query (unsupport query target)', function(done) {
      var me = Richard;
      var queryLimit = 3; // Show three media per page
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
          res.body.error.should.have.property('message', 'Bad Request');
          done();
        });
      });
    });
  });

  describe.skip('User following:', function() {
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
            loadUserAndMedia({ email: 'richard.chou@toppano.in', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              Richard = result.user;
              callback();
            });
          },
          loadHawk: function(callback) {
            loadUserAndMedia({ email: 'hawk.lin@toppano.in', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              Hawk = result.user;
              callback();
            });
          },
          loadPaco: function(callback) {
            loadUserAndMedia({ email: 'paco@toppano.in', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              Paco = result.user;
              callback();
            });
          },
          loadEric: function(callback) {
            loadUserAndMedia({ email: 'sunright0414@gmail.com', password: 'verpix' }, function(err, result) {
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

  describe('User profile and media:', function() {
    var Richard = {};
    var Hawk = {};
    var Paco = {};
    var PacoFB = {};
    var RichardMedia = [];
    var HawkMedia = [];
    var PacoMedia = [];

    before(function(done) {
      var loader = new Loader(app, __dirname + '/fixtures');
      loader.reset(function(err) {
        if (err) { throw new Error(err); }
        async.parallel({
          loadRichard: function(callback) {
            loadUserAndMedia({ email: 'richard.chou@toppano.in', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              Richard = result.user;
              RichardMedia = result.media;
              callback();
            });
          },
          loadHawk: function(callback) {
            loadUserAndMedia({ email: 'hawk.lin@toppano.in', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              Hawk = result.user;
              HawkMedia = result.media;
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
          },
          loadPacoFB: function(callback) {
            loadUserAndMedia({ email: 'youhavebigbird@hotmail.com', password: 'verpix' }, function(err, result) {
              if (err) { return callback(err); }
              PacoFB = result.user.toJSON();
              var UserIdentity = app.models.userIdentity;
              UserIdentity.find({ where: { userId: result.user.sid } }, function(err, identities) {
                if (err) { return callback(err); }
                PacoFB['identities'] = identities;
                callback();
              });
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
            HawkLikesRichardMedia5: function(callback) {
              Like.create({ mediaId: RichardMedia[5].sid, userId: Hawk.sid }, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },
            PacoLikesRichardMedia5: function(callback) {
              Like.create({ mediaId: RichardMedia[5].sid, userId: Paco.sid }, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },
            RichardLikesRichardMedia4: function(callback) {
              Like.create({ mediaId: RichardMedia[4].sid, userId: Richard.sid }, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },
            RichardLikesHawkMedia7: function(callback) {
              Like.create({ mediaId: HawkMedia[7].sid, userId: Richard.sid }, function(err) {
                if (err) { return callback(err); }
                callback();
              });
            },
            PacoLikesHawkMedia6: function(callback) {
              Like.create({ mediaId: HawkMedia[6].sid, userId: Paco.sid }, function(err) {
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
          autobiography: null,
          media: 11,
        });
          
        res.body.profile.should.not.have.properties('followers');
        res.body.profile.should.not.have.properties('following');
        res.body.profile.should.not.have.properties('isFollowing');
        done();
      });
    });
    
    it('get user own profile with follow', function(done) {
      var me = Richard;
      json('get', endpoint+'/'+me.sid+'/profile?access_token='+me.accessToken.id+'&withFollow=true')
      .expect(200, function(err, res) {
        if (err) { return done(err); } 
        res.body.profile.should.have.properties({
          sid: me.sid,
          username: me.username,
          profilePhotoUrl: me.profilePhotoUrl,
          autobiography: null,
          followers: 1,
          following: 2,
          media: 11,
          isFollowing: false
        });
        done();
      });
    });

    it('get user own profile (FB registered user)', function(done) {
      var me = PacoFB;
      json('get', endpoint+'/'+me.sid+'/profile?access_token='+me.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.profile.should.have.properties({
          sid: me.sid,
          username: me.identities[0].profile.displayName,
          profilePhotoUrl: me.profilePhotoUrl,
          autobiography: null,
          media: 0,
        });        
        
        res.body.profile.should.not.have.properties('followers');
        res.body.profile.should.not.have.properties('following');
        res.body.profile.should.not.have.properties('isFollowing');

        done();
      });
    });

    it('get user own profile with follow (FB registered user)', function(done) {
      var me = PacoFB;
      json('get', endpoint+'/'+me.sid+'/profile?access_token='+me.accessToken.id+'&withFollow=true')
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.profile.should.have.properties({
          sid: me.sid,
          username: me.identities[0].profile.displayName,
          profilePhotoUrl: me.profilePhotoUrl,
          autobiography: null,
          followers: 0,
          following: 0,
          media: 0,
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
          profilePhotoUrl: Hawk.profilePhotoUrl,
          autobiography: null,
          media: 10,
        });

        res.body.profile.should.not.have.properties('followers');
        res.body.profile.should.not.have.properties('following');
        res.body.profile.should.not.have.properties('isFollowing');

        done();
      });
    });

    it('get the profile from other user with follow', function(done) {
      var me = Richard;
      json('get', endpoint+'/'+Hawk.sid+'/profile?access_token='+me.accessToken.id+'&withFollow=true')
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.profile.should.have.properties({
          sid: Hawk.sid,
          username: Hawk.username,
          profilePhotoUrl: Hawk.profilePhotoUrl,
          autobiography: null,
          followers: 2,
          following: 1,
          media: 10,
          isFollowing: true
        });
        done();
      });
    });

    it('return 401 if get profile without authorization', function(done) {
      var me = Richard;
      json('get', endpoint+'/'+me.sid+'/profile')
      .expect(401, function(err, res) {
        if (err) { return done(err); }
        done();
      });
    });

    it('return 401 if get profile without authorization (2)', function(done) {
      var me = Richard;
      json('get', endpoint+'/'+me.sid+'/profile?access_token=INVALID_ACCESS_TOKEN')
      .expect(401, function(err, res) {
        if (err) { return done(err); }
        done();
      });
    });

    it('query user own media', function(done) {
      var me = Richard;
      var myMedia = RichardMedia;
      json('post', endpoint+'/'+me.sid+'/profile/query?access_token='+me.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.result.should.have.property('page');
        res.body.result.page.should.have.property('hasNextPage', false);
        res.body.result.page.should.have.property('count', myMedia.length);
        res.body.result.should.have.property('feed');
        res.body.result.feed.should.be.instanceof(Array).with.lengthOf(myMedia.length);
        res.body.result.feed[0].should.not.have.properties('likes');
        res.body.result.feed[1].should.not.have.properties('likes');
        done();
      });
    });

    it('query user own media with like', function(done) {
      var me = Richard;
      var myMedia = RichardMedia;
      json('post', endpoint+'/'+me.sid+'/profile/query?access_token='+me.accessToken.id+'&withLike=true')
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.result.should.have.property('page');
        res.body.result.page.should.have.property('hasNextPage', false);
        res.body.result.page.should.have.property('count', myMedia.length);
        res.body.result.should.have.property('feed');
        res.body.result.feed.should.be.instanceof(Array).with.lengthOf(myMedia.length);
        res.body.result.feed[0].likes.should.have.properties({ count: 0, isLiked: false });
        res.body.result.feed[1].likes.should.have.properties({ count: 0, isLiked: false });
        done();
      });
    });

    it('return 401 if query user media without authorization', function(done) {
      var me = Richard;
      json('post', endpoint+'/'+me.sid+'/profile/query')
      .expect(401, function(err, res) {
        if (err) { return done(err); }
        done();
      });
    });

    it('return 401 if query user media without authorization (2)', function(done) {
      var me = Richard;
      json('post', endpoint+'/'+me.sid+'/profile/query?access_token=INVALID_ACCESS_TOKEN')
      .expect(401, function(err, res) {
        if (err) { return done(err); }
        done();
      });
    });

    it('query media from other user', function(done) {
      var me = Richard;
      json('post', endpoint+'/'+Hawk.sid+'/profile/query?access_token='+me.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.result.should.have.property('page');
        res.body.result.page.should.have.property('hasNextPage', false);
        res.body.result.page.should.have.property('count', HawkMedia.length);

        res.body.result.should.have.property('feed');
        res.body.result.feed.should.be.instanceof(Array).with.lengthOf(HawkMedia.length);
        res.body.result.feed[0].should.not.have.properties('likes');
        res.body.result.feed[1].should.not.have.properties('likes');
        done();
      });
    });

    it('query media from other user with like', function(done) {
      var me = Richard;
      json('post', endpoint+'/'+Hawk.sid+'/profile/query?access_token='+me.accessToken.id+'&withLike=true')
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.result.should.have.property('page');
        res.body.result.page.should.have.property('hasNextPage', false);
        res.body.result.page.should.have.property('count', HawkMedia.length);

        res.body.result.should.have.property('feed');
        res.body.result.feed.should.be.instanceof(Array).with.lengthOf(HawkMedia.length);
        res.body.result.feed[0].likes.should.have.properties({ count: 0, isLiked: false });
        res.body.result.feed[1].likes.should.have.properties({ count: 0, isLiked: false });
        done();
      });
    });
  });
});
