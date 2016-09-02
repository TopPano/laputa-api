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
var User, Post, File;

function json(verb, url, contentType) {
    return request(app)[verb](url)
        .set('Content-Type', contentType ? contentType : 'application/json')
        .set('Accept', 'application/json')
        .expect('Content-Type', /json/);
}

describe('REST API endpoint /media:', function() {

    function loadUserAndMedias(cred, callback) {
        assert(cred.email);
        assert(cred.password);
        var User = app.models.user;
        var Media = app.models.media;
        var user = {};
        var medias = [];
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
                    medias = result;
                    callback(null, { user: user, medias: medias });
                });
            });
        });
    }

    describe('Media - CRUD:', function() {
        var Hawk = {};
        var HawkMedias = [];
        var Richard = {};
        var RichardMedias = [];

        before(function(done) {
            var loader = new Loader(app, __dirname + '/fixtures');
            loader.reset(function(err) {
                if (err) { throw new Error(err); }
                async.parallel({
                    loadHawk: function(callback) {
                        loadUserAndMedias({ email: 'hawk.lin@toppano.in', password: 'verpix' }, function(err, result) {
                            if (err) { return callback(err); }
                            Hawk = result.user;
                            HawkMedias = result.medias;
                            callback();
                        });
                    },
                    loadRichard: function(callback) {
                        loadUserAndMedias({ email: 'richard.chou@toppano.in', password: 'verpix' }, function(err, result) {
                            if (err) { return callback(err); }
                            Richard = result.user;
                            RichardMedias = result.medias;
                            callback();
                        });
                    }
                }, function(err) {
                    var Like = app.models.like;
                    Like.create({ mediaId: HawkMedias[0].sid, userId: Hawk.sid }, function(err) {
                        if (err) { return done(err); }
                        done();
                    });
                });
            });
        });

        it('create a new media for panophoto with location name', function(done) {
            var user = Hawk;
            json('post', endpoint+'/panophoto?access_token='+user.accessToken.id, 'multipart/form-data')
                .field('caption', 'test for panophoto')
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
                    res.body.result.should.have.property('mediaId');
                    done();
                });
        });

        it('create a new media for panophoto with location id', function(done) {
            var user = Hawk;
            json('post', endpoint+'/panophoto?access_token='+user.accessToken.id, 'multipart/form-data')
                .field('caption', 'test for panophoto')
                .field('width', '8192')
                .field('height', '4096')
                .field('thumbLat', '30')
                .field('thumbLng', '90')
                .field('locationProviderId', '89473918471')
                .field('locationName', 'Home Sweet Home')
                .field('locationCity', 'Taipei')
                .field('locationStreet', 'SongJung Road')
                .field('locationZip', '10483')
                .field('locationLat', '25.05511')
                .field('locationLng', '121.61171')
                .attach('thumbnail', __dirname+'/fixtures/1_thumb.jpg')
                .attach('image', __dirname+'/fixtures/1.jpg.zip')
                .expect(200, function(err, res) {
                    if (err) { return done(err); }
                    res.body.result.should.have.property('mediaId');
                    done();
                });
        });

        it('create a new media for panophoto without location data', function(done) {
            var user = Hawk;
            json('post', endpoint+'/panophoto?access_token='+user.accessToken.id, 'multipart/form-data')
                .field('caption', 'test for panophoto')
                .field('width', '8192')
                .field('height', '4096')
                .field('thumbLat', '30')
                .field('thumbLng', '90')
                .attach('thumbnail', __dirname+'/fixtures/1_thumb.jpg')
                .attach('image', __dirname+'/fixtures/1.jpg.zip')
                .expect(200, function(err, res) {
                    if (err) { return done(err); }
                    res.body.result.should.have.property('mediaId');
                    done();
                });
        });

        it('create a new media for livephoto', function(done) {
            var user = Hawk;
            json('post', endpoint+'/livephoto?access_token='+user.accessToken.id, 'multipart/form-data')
                .field('caption', 'test for livephoto')
                .field('width', '640')
                .field('height', '480')
                .field('imgArrBoundary', 'papayabird')
                .field('orientation', 'portrait')
                .field('recordDirection', 'horizontal')
                .field('locationName', 'Home Sweet Home')
                .field('locationLat', '25.05511')
                .field('locationLng', '121.61171')
                .attach('thumbnail', __dirname+'/fixtures/1_thumb.jpg')
                .attach('image', __dirname+'/fixtures/livephoto.zip')
                .expect(200, function(err, res) {
                    if (err) { return done(err); }
                    res.body.result.should.have.property('mediaId');
                    done();
                });
        });

        it('return 400 if missing properties when creating a livephoto media', function(done) {
            var user = Hawk;
            json('post', endpoint+'/livephoto?access_token='+user.accessToken.id, 'multipart/form-data')
                .field('caption', 'test for livephoto')
                .field('width', '640')
                .field('height', '480')
                .field('imgArrBoundary', 'papayabird')
                .field('recordDirection', 'horizontal')
                .field('locationName', 'Home Sweet Home')
                .field('locationLat', '25.05511')
                .field('locationLng', '121.61171')
                .attach('thumbnail', __dirname+'/fixtures/1_thumb.jpg')
                .attach('image', __dirname+'/fixtures/livephoto.zip')
                .expect(400, function(err, res) {
                    if (err) { return done(err); }
                    res.body.error.message.should.equal('missing properties');
                    done();
                });
        });

        it('return 400 if missing properties when creating a livephoto media(2)', function(done) {
            var user = Hawk;
            json('post', endpoint+'/livephoto?access_token='+user.accessToken.id, 'multipart/form-data')
                .field('caption', 'test for livephoto')
                .field('width', '640')
                .field('height', '480')
                .field('orientation', 'portrait')
                .field('recordDirection', 'horizontal')
                .field('locationName', 'Home Sweet Home')
                .field('locationLat', '25.05511')
                .field('locationLng', '121.61171')
                .attach('thumbnail', __dirname+'/fixtures/1_thumb.jpg')
                .attach('image', __dirname+'/fixtures/livephoto.zip')
                .expect(400, function(err, res) {
                    if (err) { return done(err); }
                    res.body.error.message.should.equal('missing properties');
                    done();
                });
        });

        it('return 400 if create a livephoto media with invalid properties', function(done) {
            var user = Hawk;
            json('post', endpoint+'/livephoto?access_token='+user.accessToken.id, 'multipart/form-data')
                .field('caption', 'test for livephoto')
                .field('width', '640')
                .field('height', '480')
                .field('imgArrBoundary', 'papayabird')
                .field('orientation', 'portrait')
                .field('recordDirection', 'updown')
                .field('locationName', 'Home Sweet Home')
                .field('locationLat', '25.05511')
                .field('locationLng', '121.61171')
                .attach('thumbnail', __dirname+'/fixtures/1_thumb.jpg')
                .attach('image', __dirname+'/fixtures/livephoto.zip')
                .expect(400, function(err, res) {
                    if (err) { return done(err); }
                    res.body.error.message.should.equal('invalid direction value');
                    done();
                });
        });

        it('return 400 if create a livephoto media with invalid properties (2)', function(done) {
            var user = Hawk;
            json('post', endpoint+'/livephoto?access_token='+user.accessToken.id, 'multipart/form-data')
                .field('caption', 'test for livephoto')
                .field('width', '640')
                .field('height', '480')
                .field('orientation', 'invalidOrientationValue')
                .field('recordDirection', 'horizontal')
                .field('locationName', 'Home Sweet Home')
                .field('locationLat', '25.05511')
                .field('locationLng', '121.61171')
                .attach('thumbnail', __dirname+'/fixtures/1_thumb.jpg')
                .attach('image', __dirname+'/fixtures/livephoto.zip')
                .expect(400, function(err, res) {
                    if (err) { return done(err); }
                    console.log(res.body.error.message);
                    res.body.error.message.should.equal('missing properties');
                    done();
                });
        });

        it('return a media by id', function(done) {
            var user = Hawk;
            var media = HawkMedias[0];
            json('get', endpoint+'/'+media.sid)
                .expect(200, function(err, res) {
                    if (err) { return done(err); }
                    res.body.result.should.have.property('created');
                    res.body.result.should.have.property('modified');
                    res.body.result.should.have.property('type');
                    res.body.result.should.have.property('content');
                    res.body.result.should.have.property('caption');
                    res.body.result.should.have.property('ownerId', user.sid);
                    res.body.result.should.have.property('owner');
                    res.body.result.should.have.property('likes');
                    res.body.result.likes.should.have.properties({
                        count: 1,
                        isLiked: false
                    });
                    done();
                });
        });

        it('return a media by id (2)', function(done) {
            var user = Richard;
            var media = RichardMedias[0];
            json('get', endpoint+'/'+media.sid)
                .expect(200, function(err, res) {
                    if (err) { return done(err); }
                    res.body.result.should.have.property('created');
                    res.body.result.should.have.property('modified');
                    res.body.result.should.have.property('type');
                    res.body.result.should.have.property('content');
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

        it('return a media by id (with access token)', function(done) {
            var user = Hawk;
            var media = HawkMedias[0];
            json('get', endpoint+'/'+media.sid+'?access_token='+user.accessToken.id)
                .expect(200, function(err, res) {
                    if (err) { return done(err); }
                    res.body.result.should.have.property('created');
                    res.body.result.should.have.property('modified');
                    res.body.result.should.have.property('type');
                    res.body.result.should.have.property('content');
                    res.body.result.should.have.property('caption');
                    res.body.result.should.have.property('ownerId', user.sid);
                    res.body.result.should.have.property('owner');
                    res.body.result.should.have.property('likes');
                    res.body.result.likes.should.have.properties({
                        count: 1,
                        isLiked: true
                    });
                    done();
                });
        });

        it('return a media by id (with access token) (2)', function(done) {
            var user = Richard;
            var media = HawkMedias[0];
            var mediaOwner = Hawk;
            json('get', endpoint+'/'+media.sid+'?access_token='+user.accessToken.id)
                .expect(200, function(err, res) {
                    if (err) { return done(err); }
                    res.body.result.should.have.property('created');
                    res.body.result.should.have.property('modified');
                    res.body.result.should.have.property('type');
                    res.body.result.should.have.property('content');
                    res.body.result.should.have.property('caption');
                    res.body.result.should.have.property('ownerId', mediaOwner.sid);
                    res.body.result.should.have.property('owner');
                    res.body.result.should.have.property('likes');
                    res.body.result.likes.should.have.properties({
                        count: 1,
                        isLiked: false
                    });
                    done();
                });
        });

        it('update media caption', function(done) {
            var user = Hawk;
            var media = HawkMedias[0];
            var newCaption = 'It just a museum.';
            json('put', endpoint+'/'+media.sid+'?access_token='+user.accessToken.id)
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

        it('delete a media', function(done) {
            var user = Hawk;
            var media = HawkMedias[0];
            json('delete', endpoint+'/'+media.sid+'?access_token='+user.accessToken.id)
                .expect(200, function(err, res) {
                    done(err);
                });
        });

        it('return 401 when delete a media by using a token that does not have the authority', function(done) {
            var user = Richard;
            var media = HawkMedias[1];
            json('delete', endpoint+'/'+media.sid+'?access_token='+user.accessToken.id)
                .expect(401, function(err, res) {
                    done(err);
                });
        });
    });


    describe('Post - like', function() {
        var user = {};
        var medias = [];

        before(function(done) {
            var loader = new Loader(app, __dirname + '/fixtures');
            loader.reset(function(err) {
                if (err) { throw new Error(err); }
                var User = app.models.user;
                var Media = app.models.media;
                User.find({ where: { email: 'hawk.lin@toppano.in' } }, function(err, result) {
                    if (err) { return done(err); }
                    assert(result.length !== 0);
                    user = result[0];
                    User.login({ email: user.email, password: 'verpix' }, function(err, accessToken) {
                        if (err) { return done(err); }
                        assert(accessToken.userId);
                        assert(accessToken.id);
                        user.accessToken = accessToken;
                        Media.find({ where: { ownerId: user.sid } }, function(err, result) {
                            if (err) { return done(err); }
                            medias = result;
                            done();
                        });
                    });
                });
            });
        });

        it('like a media', function(done) {
            var media = medias[0];
            json('post', endpoint+'/'+media.sid+'/like?access_token='+user.accessToken.id)
                .send({userId: user.sid})
                .expect(200, function(err, res) {
                    if (err) { return done(err); }
                    done();
                });
        });

        it('return 400 if request body does not contain userId when like a media', function(done) {
            var media = medias[0];
            json('post', endpoint+'/'+media.sid+'/like?access_token='+user.accessToken.id)
                .expect(400, function(err, res) {
                    res.body.error.should.have.property('message', 'missing property: user ID');
                    done(err);
                });
        });

        it('return 404 when like a media that does not exist', function(done) {
            json('post', endpoint+'/123/like?access_token='+user.accessToken.id)
                .send({userId: user.sid})
                .expect(404, function(err, res) {
                    res.body.error.should.have.property('message', 'media not found');
                    done(err);
                });
        });

        it('unlike a media', function(done) {
            var media = medias[0];
            json('post', endpoint+'/'+media.sid+'/unlike?access_token='+user.accessToken.id)
                .send({userId: user.sid})
                .expect(200, function(err, res) {
                    if (err) { return done(err); }
                    done();
                });
        });

        it('return 400 if request body does not contain userId when unlike a media', function(done) {
            var media = medias[0];
            json('post', endpoint+'/'+media.sid+'/unlike?access_token='+user.accessToken.id)
                .expect(400, function(err, res) {
                    res.body.error.should.have.property('message', 'missing property: user ID');
                    done(err);
                });
        });

        it('return 404 when unlike a media that does not exist', function(done) {
            json('post', endpoint+'/123/unlike?access_token='+user.accessToken.id)
                .send({userId: user.sid})
                .expect(404, function(err, res) {
                    done(err);
                });
        });

    });
});
