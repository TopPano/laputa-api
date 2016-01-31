/* jshint camelcase: false */
'use strict';
var app = require('../../server/server');
var request = require('supertest');
var should = require('should');
var async = require('async');
var zlib = require('zlib');

var apiVersion = require('../../package.json').version.split('.').shift();
var endpointRoot = '/api' + (apiVersion > 0 ? '/v' + apiVersion :  '');
var endpoint = endpointRoot + '/posts';

function json(verb, url, contentType) {
  return request(app)[verb](url)
    .set('Content-Type', contentType ? contentType : 'application/json')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/);
}

describe('REST API endpoint /post', function() {

  var user = {
    username: 'Richard',
    email: 'richchou@toppano.in',
    password: 'password'
  };
  var posts = [
    {
      message: 'The Louvre or the Louvre Museum is one of the world largest museums and a historic monument in Paris, France.',
      address: '75001 Paris, France',
      nodeList: [
        {
          heading: 30,
          snapshotList: [
            {
              lat: 50,
              lng: 100,
              fov: 70,
              height: 300,
              weight: 300
            }
          ],
          fileList: [
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
          heading: 30,
          snapshotList: [
            {
              lat: -10,
              lng: 90,
              fov: 70,
              height: 300,
              weight: 300
            }
          ],
          fileList: [
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
      ]
    },
    {
      message: 'Jedi Temple was the home of the Jedi Order on Coruscant.',
      address: 'somewhere in the galaxy far far away'
    },
    {
      message: 'Palace of Versailles.',
      address: 'Place dArmes, 78000 Versailles, France'
    }
  ];

  before(function(done) {
    var User = app.models.user;
    var Post = app.models.post;
    var File = app.models.file;

    User.create(user, function(err, newUser) {
      if (err) { return done(err); }
      user.sid = newUser.sid;
      User.login({
        email: user.email,
        password: user.password
      }, function(err, token) {
        if (err) { return done(err); }
        user.accessToken = token;

        // Create posts
        async.each(posts, function(post, callback) {
          Post.create({
            status: post.status,
            message: post.message,
            viewerOptions: post.viewerOptions,
            ownerId: user.sid
          }, function(err, newPost) {
            if (err) { return callback(err); }
            post.sid = newPost.sid;
            async.series({
              insertNodes: function(callback) {
                if (post.hasOwnProperty('nodeList')) {
                  async.each(post.nodeList, function(node, cb) {
                    newPost.nodes.create({
                      heading: node.heading
                    }, function(err, newNode) {
                      if (err) { return cb(err); }
                      node.sid = newNode.sid;
                      async.each(node.snapshotList, function(snapshot, cb) {
                        snapshot.nodeId = newNode.sid;
                        newPost.snapshots.create(snapshot, function(err) {
                          if (err) { return cb(err); }
                          cb();
                        });
                      }, function(err) {
                        if (err) { return cb(err); }
                        cb();
                      });
                    });
                  }, function(err) {
                    if (err) { return callback(err); }
                    callback();
                  });
                } else {
                  callback();
                }
              },
              insertFiles: function(callback) {
                // only insert files for those posts which have nodes
                if (post.hasOwnProperty('nodeList')) {
                  async.each(post.nodeList, function(node, cb) {
                    async.each(node.fileList, function(file, cb) {
                      file.postId = post.sid;
                      file.nodeId = node.sid;
                      File.create(file, function(err, newFile) {
                        if (err) { return cb(err); }
                        file.sid = newFile.sid;
                        cb();
                      });
                    }, function(err) {
                      if (err) { return cb(err); }
                      cb();
                    });
                  }, function(err) {
                    if (err) { return callback(err); }
                    callback();
                  });
                } else {
                  callback();
                }
              }
            }, function(err) {
              if (err) { return callback(err); }
              callback();
            });
          });
        }, function(err) {
          done(err);
        });
      });
    });
  });

  after(function(done) {
    var User = app.models.user;
    var Post = app.models.post;
    async.each([User, Post], function(dataModel, callback) {
      dataModel.destroyAll(function(err) {
        if (err) { return callback(err); }
        callback();
      });
    },
    function(err) {
      done(err);
    });
  });

  it('should return a post by id', function(done) {
    var post = posts[0];
    json('get', endpoint+'/'+post.sid)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.have.property('ownerId', user.sid);

        res.body.should.have.property('nodes');
        res.body.nodes.should.be.instanceof(Object);
        res.body.nodes.should.have.properties([
          post.nodeList[0].sid,
          post.nodeList[1].sid
        ]);

        res.body.should.have.property('snapshotList');
        res.body.snapshotList.should.be.instanceof(Array);
        res.body.snapshotList.should.containDeep([
          post.nodeList[0].snapshotList[0],
          post.nodeList[1].snapshotList[0]
        ]);
        done();
      });
  });

  it('should create a new post', function(done) {
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

  it('should update a post', function(done) {
    var post = posts[0];
    var postMessage = 'It just a museum.';
    json('put', endpoint+'/'+post.sid+'?access_token='+user.accessToken.id)
      .send({
        message: postMessage,
      })
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.have.properties({
          message: postMessage,
          ownerId: user.sid
        });
        done();
      });
  });

  it('should delete a post', function(done) {
    var post = posts[2];
    json('delete', endpoint+'/'+post.sid+'?access_token='+user.accessToken.id)
      .expect(200, function(err, res) {
        done(err);
      });
  });

  it('should create a new node for the post', function(done) {
    var post = posts[1];
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

  it('should like a post', function(done) {
    var post = posts[0];
    json('post', endpoint+'/'+post.sid+'/like?access_token='+user.accessToken.id)
      .send({userId: user.sid})
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        json('get', endpoint+'/'+post.sid)
          .expect(200, function(err, res) {
            if (err) { return done(err); }
            res.body.should.have.property('likes', 1);
            done();
          });
      });
  });

  it('should unlike a post', function(done) {
    var post = posts[0];
    json('post', endpoint+'/'+post.sid+'/like?access_token='+user.accessToken.id)
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
                res.body.should.have.property('likes', 0);
                done();
              });
          });
      });
  });

  it('should ignore duplicated likes', function(done) {
    var post = posts[0];
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
                res.body.should.have.property('likes', 1);
                done();
              });
          });
      });
  });

  it('should ignore double unlike', function(done) {
    var post = posts[0];
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
                res.body.should.have.property('likes', 0);
                done();
              });
          });
      });
  });

  it('should return 404 if the post to be liked does not exist', function(done) {
    json('post', endpoint+'/123/like')
      .send({userId: user.sid})
      .expect(404, function(err, res) {
        done(err);
      });
  });

  it('should return 400 if request body does not contain userId', function(done) {
    var post = posts[1];
    json('post', endpoint+'/'+post.sid+'/like?access_token='+user.accessToken.id)
      .expect(400, function(err, res) {
        res.body.error.should.have.property('message', 'Missing property: userId');
        done(err);
      });
  });

  it('should update node metadata of a post', function(done) {
    var post = posts[0];
    json('get', endpoint+'/'+post.sid+'/nodes')
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        var node = res.body[0];
        node.tag = 'office';
        json('put', endpoint+'/'+post.sid+'/nodes/'+node.sid+'?access_token='+user.accessToken.id)
          .send(node)
          .expect(200, function(err, res) {
            if (err) { return done(err); }
            res.body.should.have.properties({ tag: 'office' });
            done();
          });
      });
  });

  it('should create a new snapshot for a post', function(done) {
    var post = posts[0];
    // XXX: Supertest can support sending fields only with string. So currently we won't
    //      test with sending property "metadta: { ... }"
    json('post', endpoint+'/'+post.sid+'/snapshots?access_token='+user.accessToken.id, 'multipart/form-data')
      .field('lat', '90')
      .field('lng', '90')
      .field('fov', '90')
      .field('width', '400')
      .field('height', '200')
      .field('nodeId', post.nodeList[0].sid)
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
              nodeId: post.nodeList[0].sid
            });
            res.body.should.have.property('url');
            res.body.should.have.property('downloadUrl');
            done();
          });
      });
  });

  it('should return a node list of a post', function(done) {
    var post = posts[0];
    json('get', endpoint+'/'+post.sid+'/nodes')
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.be.instanceof(Array).and.have.length(post.nodeList.length);
        done();
      });
  });

  it('should return a snapshot list of a post', function(done) {
    var post = posts[0];
    json('get', endpoint+'/'+post.sid+'/snapshots')
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.be.instanceof(Array);
        res.body.should.containDeep([
          post.nodeList[0].snapshotList[0],
          post.nodeList[1].snapshotList[0]
        ]);
        done();
      });
  });

  it('should return files of a post by post id', function(done) {
    var post = posts[0];
    json('get', endpoint+'/'+post.sid+'/files')
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.be.instanceof(Object);
        res.body.should.have.properties([
          post.nodeList[0].fileList[0].name,
          post.nodeList[0].fileList[1].name,
          post.nodeList[1].fileList[0].name,
          post.nodeList[1].fileList[1].name
        ]);
        done();
      });
  });

});
