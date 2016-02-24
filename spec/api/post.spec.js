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

describe('REST API endpoint /post', function() {

  var user = {
    username: 'Hawk Lin',
    email: 'hawk.lin@toppano.in',
    password: 'password'
  };

  before(function(done) {
    User = app.models.user;
    Post = app.models.post;
    File = app.models.file;

    User.create(user, function(err, newUser) {
      if (err) { return done(err); }
      assert(newUser.sid);
      assert.equal(newUser.email, user.email);
      user.sid = newUser.sid;
      User.login({email: user.email, password: user.password}, function(err, accessToken) {
        if (err) { return done(err); }
        assert(accessToken.userId);
        assert(accessToken.id);
        user.accessToken = accessToken;
        done();
      });
    });
  });

  describe('Post - CRUD', function() {
    var post = {
      message: '!!The Louvre or the Louvre Museum is one of the world largest museums and a historic monument in Paris, France.',
      address: '75001 Paris, France'
    };
    before(function(done) {
      post.ownerId = user.sid;
      Post.create(post, function(err, newPost) {
        if (err) { return done(err); }
        post.sid = newPost.sid;
        done();
      });
    });

    it('create a new post', function(done) {
      var message = 'It just an office.';
      json('post', endpoint+'?access_token='+user.accessToken.id)
      .send({
        message: message,
        numOfImages: 1,
        ownerId: user.sid
      })
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.have.property('ownerId', user.sid);
        res.body.should.have.property('message', message);
        res.body.should.have.property('likes', 0);
        done();
      });
    });

    it('return a post by providing valid post id', function(done) {
      json('get', endpoint+'/'+post.sid)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.have.property('ownerId', user.sid);
        res.body.should.have.property('ownerInfo');
        res.body.ownerInfo.should.have.property('username', user.username);
        done();
      });
    });

    it('update a post', function(done) {
      var newMessage = 'It just a museum.';
      json('put', endpoint+'/'+post.sid+'?access_token='+user.accessToken.id)
      .send({
        message: newMessage
      })
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.have.properties({
          message: newMessage,
          ownerId: user.sid
        });
        done();
      });
    });

    it('delete a post', function(done) {
      json('delete', endpoint+'/'+post.sid+'?access_token='+user.accessToken.id)
      .expect(200, function(err, res) {
        done(err);
      });
    });
  });

  describe('Post - like', function() {
    var post = {
      message: 'Jedi Temple was the home of the Jedi Order on Coruscant.',
      address: 'somewhere in the galaxy far far away'
    };

    before(function(done) {
      post.ownerId = user.sid;
      Post.create(post, function(err, newPost) {
        if (err) { return done(err); }
        post.sid = newPost.sid;
        done();
      });
    });

    it('like a post', function(done) {
      json('post', endpoint+'/'+post.sid+'/like?access_token='+user.accessToken.id)
      .send({userId: user.sid})
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        done();
      });
    });

    it('return 400 if request body does not contain userId when like a post', function(done) {
      json('post', endpoint+'/'+post.sid+'/like?access_token='+user.accessToken.id)
      .expect(400, function(err, res) {
        res.body.error.should.have.property('message', 'Missing property: userId');
        done(err);
      });
    });

    it('return 404 when like a post that does not exist', function(done) {
      json('post', endpoint+'/123/like')
      .send({userId: user.sid})
      .expect(404, function(err, res) {
        done(err);
      });
    });

    it('unlike a post', function(done) {
      json('post', endpoint+'/'+post.sid+'/unlike?access_token='+user.accessToken.id)
      .send({userId: user.sid})
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        done();
      });
    });

    it('return 400 if request body does not contain userId when unlike a post', function(done) {
      json('post', endpoint+'/'+post.sid+'/unlike?access_token='+user.accessToken.id)
      .expect(400, function(err, res) {
        res.body.error.should.have.property('message', 'Missing property: userId');
        done(err);
      });
    });

    it('return 404 when unlike a post that does not exist', function(done) {
      json('post', endpoint+'/123/unlike')
      .send({userId: user.sid})
      .expect(404, function(err, res) {
        done(err);
      });
    });
  });

  describe('Post - nodes', function() {
    var post = {
      message: 'Long time no see my friends! Good to see you all.',
      address: 'Africa'
    };
    var nodes = [
      {
        index: 1,
        heading: 20,
        width: 4000,
        height: 2000
      },
      {
        index: 2,
        heading: 25,
        width: 4000,
        height: 2000
      }
    ];

    before(function(done) {
      post.ownerId = user.sid;
      Post.create(post, function(err, newPost) {
        if (err) { return done(err); }
        post.sid = newPost.sid;
        async.each(nodes, function(node, callback) {
          newPost.nodes.create(node, function(err, newNode) {
            if (err) { return callback(err); }
            node.sid = newNode.sid;
            callback();
          });
        }, function(err) {
          if (err) { return done(err); }
          done();
        });
      });
    });

    it('the returned post should contain a node list, if any', function(done) {
      json('get', endpoint+'/'+post.sid)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        assert(post.ownerId);
        res.body.should.have.property('nodes');
        res.body.nodes.should.be.instanceof(Object);
        res.body.nodes.should.have.properties([
          nodes[0].sid,
          nodes[1].sid
        ]);
        done();
      });
    });

    it('return a node list of a given post', function(done) {
      json('get', endpoint+'/'+post.sid+'/nodes')
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.be.instanceof(Array).and.have.length(nodes.length);
        done();
      });
    });

    it.skip('create a new node for the given post', function(done) {
      json('post', endpoint+'/'+post.sid+'/nodes?access_token='+user.accessToken.id, 'multipart/form-data')
      .field('heading', '30')
      .field('width', '8192')
      .field('height', '4096')
      .field('index', '1')
      .attach('image', __dirname+'/fixtures/1.jpg.zip')
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        json('get', endpoint+'/'+post.sid+'/nodes/'+res.body.sid)
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          res.body.should.have.properties({
            heading: 30
          });
          res.body.should.have.property('thumbnailUrl');
          res.body.should.have.property('srcUrl');
          res.body.should.have.property('srcDownloadUrl');
          res.body.should.have.property('srcMobileUrl');
          res.body.should.have.property('srcMobileDownloadUrl');
          done();
        });
      });
    });

    it('update the nodes metadata of a given post', function(done) {
      json('get', endpoint+'/'+post.sid+'/nodes')
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        var node = res.body[0];
        node.heading = 100;
        node.width = 3000;
        node.height = 1500;
        json('put', endpoint+'/'+post.sid+'/nodes/'+node.sid+'?access_token='+user.accessToken.id)
        .send(node)
        .expect(200, function(err, res) {
          if (err) { return done(err); }
          res.body.should.have.properties({ heading: 100, width: 3000, height: 1500 });
          done();
        });
      });
    });
  });

  describe('Post - snapshot', function() {
    var post = {
      message: 'Love has so many shapes and shades.',
      address: 'Taipei'
    };
    var nodes = [
      {
        nodeData: {
          index: 1,
          heading: 20,
          width: 4000,
          height: 2000
        },
        snapshots: [
          {
            lat: -10,
            lng: 90,
            fov: 70,
            height: 300,
            weight: 300
          }
        ]
      },
      {
        nodeData: {
          index: 2,
          heading: 25,
          width: 4000,
          height: 2000
        },
        snapshots: [
          {
            lat: 50,
            lng: 100,
            fov: 70,
            height: 300,
            weight: 300
          }
        ]
      }
    ];

    before(function(done) {
      post.ownerId = user.sid;
      Post.create(post, function(err, newPost) {
        if (err) { return done(err); }
        post.sid = newPost.sid;
        async.each(nodes, function(node, callback) {
          newPost.nodes.create(node.nodeData, function(err, newNode) {
            if (err) { return callback(err); }
            node.nodeData.sid = newNode.sid;
            async.each(node.snapshots, function(snapshot, callback) {
              snapshot.nodeId = node.nodeData.sid;
              newPost.snapshots.create(snapshot, function(err, newSnapshot) {
                if (err) { return callback(err); }
                snapshot.sid = newSnapshot.sid;
                callback();
              });
            }, function(err) {
              if (err) { return callback(err); }
              callback();
            });
          });
        }, function(err) {
          if (err) { return done(err); }
          done();
        });
      });
    });

    it('create a new snapshot for a post', function(done) {
      // XXX: Supertest can support sending fields only with string. So currently we won't
      //      test with sending property "metadta: { ... }"
      json('post', endpoint+'/'+post.sid+'/snapshots?access_token='+user.accessToken.id, 'multipart/form-data')
      .field('lat', '90')
      .field('lng', '90')
      .field('fov', '90')
      .field('width', '400')
      .field('height', '200')
      .field('nodeId', nodes[0].nodeData.sid)
      .attach('image', __dirname+'/fixtures/1_thumb.jpg')
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        json('get', endpoint+'/'+post.sid+'/snapshots/'+res.body.sid)
        .expect(200, function(err, res) {
          res.body.should.have.properties({
            lat: 90,
            lng: 90,
            fov: 90,
            width: 400,
            height: 200,
            nodeId: nodes[0].nodeData.sid
          });
          res.body.should.have.property('url');
          res.body.should.have.property('downloadUrl');
          done();
        });
      });
    });

    it('return a snapshot list of a given post', function(done) {
      json('get', endpoint+'/'+post.sid+'/snapshots')
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.be.instanceof(Array);
        res.body.should.containDeep([
          nodes[0].snapshots[0],
          nodes[1].snapshots[0]
        ]);
        done();
      });
    });
  });

  describe('Post - files', function() {
    var post = {
      message: 'What a night!',
      address: 'Paris'
    };
    var nodes = [
      {
        nodeData: {
          index: 1,
          heading: 20,
          width: 4000,
          height: 2000
        },
        files: [
          {
            name: 'filename11',
            url: 'fileurl11'
          },
          {
            name: 'filename12',
            url: 'fileurl12'
          }
        ]
      },
      {
        nodeData: {
          index: 2,
          heading: 25,
          width: 4000,
          height: 2000
        },
        files: [
          {
            name: 'filename21',
            url: 'fileurl21'
          },
          {
            name: 'filename22',
            url: 'fileurl22'
          }
        ]
      }
    ];

    before(function(done) {
      post.ownerId = user.sid;
      Post.create(post, function(err, newPost) {
        if (err) { return done(err); }
        post.sid = newPost.sid;
        async.each(nodes, function(node, callback) {
          newPost.nodes.create(node.nodeData, function(err, newNode) {
            if (err) { return callback(err); }
            node.nodeData.sid = newNode.sid;
            async.each(node.files, function(file, callback) {
              file.postId = post.sid;
              file.nodeId = node.nodeData.sid;
              File.create(file, function(err, newFile) {
                if (err) { return callback(err); }
                file.sid = newFile.sid;
                callback();
              });
            }, function(err) {
              if (err) { return callback(err); }
              callback();
            });
          });
        }, function(err) {
          if (err) { return done(err); }
          done();
        });
      });
    });

    it('return files of a given post', function(done) {
      json('get', endpoint+'/'+post.sid+'/files')
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.be.instanceof(Object);
        res.body.should.have.properties([
          nodes[0].files[0].name,
          nodes[0].files[1].name,
          nodes[1].files[0].name,
          nodes[1].files[1].name
        ]);
        done();
      });
    });
  });
});
