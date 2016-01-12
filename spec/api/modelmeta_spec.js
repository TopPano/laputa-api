/* jshint camelcase: false */
'use strict';
var app = require('../../server/server');
var request = require('supertest');
var should = require('should');
var async = require('async');

var apiVersion = require('../../package.json').version.split('.').shift();
var endpointRoot = '/api' + (apiVersion > 0 ? '/v' + apiVersion :  '');
var endpoint = endpointRoot + '/modelmeta';

function json(verb, url, contentType) {
  return request(app)[verb](url)
    .set('Content-Type', contentType ? contentType : 'application/json')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/);
}

describe('REST API endpoint /modelmeta', function() {

  var user = {
    username: 'Richard',
    email: 'richchou@toppano.in',
    password: 'password'
  };
  var models = [
    {
      name: 'The Louvre',
      status: 'public',
      description: 'The Louvre or the Louvre Museum is one of the world largest museums and a historic monument in Paris, France.',
      viewerOptions: {
        description: true,
        map: false,
        share: true,
        presentedBy: true
      },
      labelList: [
        {
          name: 'museum'
        },
        {
          name: 'france'
        }
      ],
      nodeList: [
        {
          heading: 30,
          enabled: true,
          tag: 'room1',
          snapshotList: [
            {
              name: 'Mona Lisa',
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
          enabled: true,
          tag: 'room2',
          snapshotList: [
            {
              name: 'The Winged Victory of Samothrace',
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
      name: 'Jedi Temple',
      status: 'public',
      description: 'Jedi Temple was the home of the Jedi Order on Coruscant.',
      viewerOptions: {
        description: true,
        map: false,
        share: true,
        presentedBy: true
      }
    },
    {
      name: 'Palace of Versailles',
      status: 'public',
      description: 'Palace of Versailles.',
      viewerOptions: {
        description: true,
        map: false,
        share: true,
        presentedBy: true
      }
    }
  ];

  before(function(done) {
    var User = app.models.user;
    var Modelmeta = app.models.modelmeta;
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

        // Create models
        async.each(models, function(model, callback) {
          Modelmeta.create({
            name: model.name,
            status: model.status,
            description: model.description,
            viewerOptions: model.viewerOptions,
            ownerId: user.sid
          }, function(err, newModel) {
            if (err) { return callback(err); }
            model.sid = newModel.sid;
            async.series({
              insertLabels: function(callback) {
                if (model.hasOwnProperty('labelList')) {
                  async.each(model.labelList, function(label, cb) {
                    label.ownerId = newUser.sid;
                    newModel.labels.create(label, function(err) {
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
              },
              insertNodes: function(callback) {
                if (model.hasOwnProperty('nodeList')) {
                  async.each(model.nodeList, function(node, cb) {
                    newModel.nodes.create({
                      tag: node.tag,
                      heading: node.heading,
                      enabled: node.enabled
                    }, function(err, newNode) {
                      if (err) { return cb(err); }
                      node.sid = newNode.sid;
                      async.each(node.snapshotList, function(snapshot, cb) {
                        snapshot.nodeId = newNode.sid;
                        newModel.snapshots.create(snapshot, function(err) {
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
                // only insert files for those models which have nodes
                if (model.hasOwnProperty('nodeList')) {
                  async.each(model.nodeList, function(node, cb) {
                    async.each(node.fileList, function(file, cb) {
                      file.modelId = model.sid;
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
          if (err) { return done(err); }
          done();
        });
      });
    });
  });

  after(function(done) {
    var User = app.models.user;
    var Modelmeta = app.models.modelmeta;
    async.each([User, Modelmeta], function(dataModel, callback) {
      dataModel.destroyAll(function(err) {
        if (err) { return callback(err); }
        callback();
      });
    },
    function(err) {
      if (err) { return done(err); }
      done();
    });
  });

  it('should return model metadata by id', function(done) {
    var model = models[0];
    json('get', endpoint+'/'+model.sid)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.have.property('ownerId', user.sid);

        res.body.should.have.property('nodes');
        res.body.nodes.should.be.instanceof(Object);
        res.body.nodes.should.have.properties([
          model.nodeList[0].sid,
          model.nodeList[1].sid
        ]);

        res.body.should.have.property('labelList');
        res.body.labelList.should.be.instanceof(Array).and.have.length(model.labelList.length);

        res.body.should.have.property('snapshotList');
        res.body.snapshotList.should.be.instanceof(Array);
        res.body.snapshotList.should.containDeep([
          model.nodeList[0].snapshotList[0],
          model.nodeList[1].snapshotList[0]
        ]);
        done();
      });
  });

  it('should create a new model', function(done) {
    json('post', endpoint+'?access_token='+user.accessToken.id)
      .send({
        name: 'TopPano Office',
        description: 'It just an office.',
        ownerId: user.sid
      })
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.have.property('ownerId', user.sid);
        done();
      });
  });

  it('should update model metadata', function(done) {
    var model = models[0];
    var modelName = 'Louvre Museum';
    var modelDescription = 'It just a museum.';
    json('put', endpoint+'/'+model.sid+'?access_token='+user.accessToken.id)
      .send({
        name: modelName,
        description: modelDescription,
      })
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.have.properties({
          name: modelName,
          description: modelDescription,
          ownerId: user.sid
        });
        done();
      });
  });

  it('should delete a model', function(done) {
    var model = models[2];
    json('delete', endpoint+'/'+model.sid+'?access_token='+user.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        done();
      });
  });

  it('should create a new node for the model', function(done) {
    var model = models[1];
    json('post', endpoint+'/'+model.sid+'/nodes?access_token='+user.accessToken.id, 'multipart/form-data')
      .field('tag', 'room1')
      .field('heading', '30')
      .field('enabled', 'true')
      .field('width', '8192')
      .field('height', '4096')
      .attach('thumbnail', __dirname+'/fixtures/1_thumb.jpg')
      .attach('image', __dirname+'/fixtures/1.jpg')
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        json('get', endpoint+'/'+model.sid+'/nodes/'+res.body.sid)
          .expect(200, function(err, res) {
            if (err) { return done(err); }
            res.body.should.have.properties({
              tag: 'room1',
              heading: 30,
              enabled: true
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

  it('should update node metadata of a model', function(done) {
    var model = models[0];
    json('get', endpoint+'/'+model.sid+'/nodes')
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        var node = res.body[0];
        node.tag = 'office';
        json('put', endpoint+'/'+model.sid+'/nodes/'+node.sid+'?access_token='+user.accessToken.id)
          .send(node)
          .expect(200, function(err, res) {
            if (err) { return done(err); }
            res.body.should.have.properties({ tag: 'office' });
            done();
          });
      });
  });

  it('should create a new label for a model', function(done) {
    var model = models[1];
    var newLabel = {
      name: 'label1',
      ownerId: user.sid
    };
    json('post', endpoint+'/'+model.sid+'/labels?access_token='+user.accessToken.id)
      .send(newLabel)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.have.properties(newLabel);
        done();
      });
  });

  it('should create a new snapshot for a model', function(done) {
    var model = models[0];
    // XXX: Supertest can support sending fields only with string. So currently we won't
    //      test with sending property "metadta: { ... }"
    json('post', endpoint+'/'+model.sid+'/snapshots?access_token='+user.accessToken.id, 'multipart/form-data')
      .field('name', 'snapshot1')
      .field('lat', '90')
      .field('lng', '90')
      .field('fov', '90')
      .field('width', '400')
      .field('height', '200')
      .field('nodeId', model.nodeList[0].sid)
      .attach('image', __dirname+'/fixtures/1_thumb.jpg')
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        json('get', endpoint+'/'+model.sid+'/snapshots/'+res.body.sid)
          .expect(200, function(err, res) {
            res.body.should.have.properties({
              name: 'snapshot1',
              lat: 90,
              lng: 90,
              fov: 90,
              width: 400,
              height: 200,
              nodeId: model.nodeList[0].sid
            });
            res.body.should.have.property('url');
            res.body.should.have.property('downloadUrl');
            done();
          });
      });
  });

  it('should return a node list of a model', function(done) {
    var model = models[0];
    json('get', endpoint+'/'+model.sid+'/nodes')
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.be.instanceof(Array).and.have.length(model.nodeList.length);
        done();
      });
  });

  it('should return a label list of a model', function(done) {
    var model = models[0];
    json('get', endpoint+'/'+model.sid+'/labels')
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.be.instanceof(Array).and.have.length(model.labelList.length);
        done();
      });
  });

  it('should return a snapshot list of a model', function(done) {
    var model = models[0];
    json('get', endpoint+'/'+model.sid+'/snapshots')
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.be.instanceof(Array);
        res.body.should.containDeep([
          model.nodeList[0].snapshotList[0],
          model.nodeList[1].snapshotList[0]
        ]);
        done();
      });
  });

  it('should return model files by id', function(done) {
    var model = models[0];
    json('get', endpoint+'/'+model.sid+'/files')
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.be.instanceof(Object);
        res.body.should.have.properties([
          model.nodeList[0].fileList[0].name,
          model.nodeList[0].fileList[1].name,
          model.nodeList[1].fileList[0].name,
          model.nodeList[1].fileList[1].name
        ]);
        done();
      });
  });

});
