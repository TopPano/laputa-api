/* jshint camelcase: false */
'use strict';
var app = require('../../server/server');
var request = require('supertest');
var should = require('should');
var assert = require('assert');
var async = require('async');

var apiVersion = require('../../package.json').version.split('.').shift();
var endpointRoot = '/api' + (apiVersion > 0 ? '/v' + apiVersion :  '');
var endpoint = endpointRoot + '/users';

function json(verb, url) {
  return request(app)[verb](url)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/);
}

describe('REST API endpoint /users', function() {

  var users = [
    {
      sid: null,
      username: 'Richard',
      email: 'richard@foo.com',
      password: 'richard',
      prelogin: true,
      accessToken: null
    },
    {
      sid: null,
      username: 'John',
      email: 'john@foo.com',
      password: 'john',
      prelogin: false,
      accessToken: null
    },
    {
      sid: null,
      username: 'Angely',
      email: 'angely@foo.com',
      password: 'angely',
      prelogin: true,
      accessToken: null
    },
    {
      sid: null,
      username: 'Alice',
      email: 'alice@foo.com',
      password: 'alice',
      prelogin: true,
      accessToken: null
    },
    {
      sid: null,
      username: 'Bob',
      email: 'bob@foo.com',
      password: 'bob',
      prelogin: true,
      accessToken: null
    },
    {
      sid: null,
      username: 'David',
      email: 'david@foo.com',
      password: 'david',
      prelogin: true,
      accessToken: null,
      models: [
        {
          name: 'home',
          status: 'public',
          ownerId: null
        },
        {
          name: 'office',
          status: 'public',
          ownerId: null
        }
      ],
      labels: [
        {
          name: 'taipei'
        },
        {
          name: 'taichung'
        }
      ]
    }
  ];

  before(function(done) {
    var User = app.models.user;
    var Modelmeta = app.models.modelmeta;
    var Label = app.models.label;
    async.each(users, function(user, callback) {
      User.create({
        username: user.username,
        email: user.email,
        password: user.password
      }, function(err, result) {
        if (err) { return callback(err); }
        user.sid = result.sid;
        async.parallel({
          prelogin: function(callback) {
            if (user.prelogin === true) {
              User.login({
                email: user.email,
                password: user.password
              }, function(err, token) {
                if (err) { return callback(err); }
                user.accessToken = token;
                callback();
              });
            } else {
              callback();
            }
          },
          insertModels: function(callback) {
            if (user.hasOwnProperty('models')) {
              async.each(user.models, function(model, cb) {
                model.ownerId = user.sid;
                Modelmeta.create(model, function(err) {
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
          insertLabels: function(callback) {
            if (user.hasOwnProperty('labels')) {
              async.each(user.labels, function(label, cb) {
                label.ownerId = user.sid;
                Label.create(label, function(err) {
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
        },
        function(err, results) {
          if (err) { return callback(err); }
          callback();
        });
      });
    }, function(err) {
      if (err) { return done(err); }
      done();
    });
  });

  after(function(done) {
    var User = app.models.user;
    var Modelmeta = app.models.modelmeta;
    var Label = app.models.label;
    async.each([User, Modelmeta, Label], function(dataModel, callback) {
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

  it('should return a user by user id', function(done) {
    var user = users[0];
    json('get', endpoint+'/'+user.sid+'?access_token='+user.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.have.property('email', user.email);
        done();
      });
  });

  it('should return a user by user id as a literal', function(done) {
    var user = users[0];
    json('get', endpoint+'/me?access_token='+user.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.have.property('email', user.email);
        done();
      });
  });

  it('should create a new user', function(done) {
    json('post', endpoint)
      .send({
        username: 'Luke Skywalker',
        email: 'foo@bar.com',
        password: 'yoda'
      })
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.have.property('email', 'foo@bar.com');
        done();
      });
  });

  it('should allow a registered user to login', function(done) {
    var user = users[1];
    json('post', endpoint + '/login')
      .send({
        email: user.email,
        password: user.password
      })
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.have.property('id');
        res.body.should.have.property('userId', user.sid);
        done();
      });
  });

  it('should allow a logged in user to logout', function(done) {
    var user = users[2];
    json('post', endpoint+'/logout?access_token='+user.accessToken.id)
      .expect(204, function(err, res) {
        if (err) { return done(err); }
        done();
      });
  });

  it('should update user information', function(done) {
    var user = users[3];
    var newUsername = 'Eric';
    var userPhotoUrl = 'http://www.foo.com/';
    json('put', endpoint+'/me?access_token='+user.accessToken.id)
      .send({
        username: newUsername,
        userPhotoUrl: userPhotoUrl
      })
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.have.property('username', newUsername);
        res.body.should.have.property('userPhotoUrl', userPhotoUrl);
        done();
      });
  });

  it('should delete a user', function(done) {
    var user = users[4];
    json('delete', endpoint+'/me?access_token='+user.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        done();
      });
  });

  it('should return a list of models', function(done) {
    var user = users[5];
    json('get', endpoint+'/me/models?access_token='+user.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.be.instanceof(Array);
        res.body.should.containDeep([{ownerId: user.sid}]);
        done();
      });
  });

  it('should return a list of labels', function(done) {
    var user = users[5];
    json('get', endpoint+'/me/labels?access_token='+user.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.be.instanceof(Array);
        res.body.should.containDeep([{ownerId: user.sid}]);
        done();
      });
  });

  it('should return a list of shared models', function(done) {
    var user = users[5];
    json('get', endpoint+'/me/sharedModels?access_token='+user.accessToken.id)
      .expect(200, function(err, res) {
        if (err) { return done(err); }
        res.body.should.be.instanceof(Array);
        done();
      });
  });

  it('should reject request with mismatching userId and token', function(done) {
    var user = users[0];
    var user2 = users[2];
    json('get', endpoint+'/'+user.id+'?access_token='+user2.accessToken.id)
      .expect(401, function(err, res) {
        if (err) { return done(err); }
        done();
      });
  });

  it('should reject user creation of duplicated username', function(done) {
    json('post', endpoint)
      .send({
        username: 'Richard',
        email: 'foo@foo.com',
        password: 'yoda'
      })
      .expect(422, function(err, res) {
        if (err) { return done(err); }
        done();
      });
  });

  it('should reject user creation of duplicated email', function(done) {
    json('post', endpoint)
      .send({
        username: 'John',
        email: 'richard@foo.com',
        password: 'yoda'
      })
      .expect(422, function(err, res) {
        if (err) { return done(err); }
        done();
      });
  });
});
