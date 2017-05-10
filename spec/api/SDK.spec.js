/* jshint camelcase: false */
'use strict';
const licensing = require('../../server/middleware/licensing.js');
const app = require('../../server/server');

const P = require('bluebird');
const fs = require('fs');
const readFileAsync = P.promisify(fs.readFile);
const bcrypt = require('bcrypt');

const AUTH_MSG_PREFIX = 'VERPIX ';

const apiVersion = require('../../package.json').version.split('.').shift();
const endpointRoot = '/api' + (apiVersion > 0 ? '/v' + apiVersion :  '');
const endpoint = endpointRoot + '/media';

var request = require('supertest');
var should = require('should');
var assert = require('assert');

function json(verb, url, contentType) {
  return request(app)[verb](url)
  .set('Content-Type', contentType ? contentType : 'application/json')
  .set('Accept', 'application/json')
  .expect('Content-Type', /json/);
}

function reverseString(str) {
  return str.split('').reverse().join('');
}


function isVerified(verification, apiKey, resource, timestamp) {
  const isOdd = (timestamp % 2);
  const bcryptPlain = isOdd ?
                  `${resource}${reverseString(timestamp.toString())}${reverseString(apiKey)}${timestamp}` :
                  `${reverseString(resource)}${timestamp}${apiKey}${reverseString(timestamp.toString())}`;
  return bcrypt.compareSync(bcryptPlain, verification);
}

describe.only('SDK: ', function() {
  function insertSampleAsync(path, model){
    return readFileAsync(path)
            .then((data) => {
              let jsonData = JSON.parse(data.toString());
              return new P.Promise((resolve, reject) => {
                // TODO: it needs to be refined here
                jsonData[0].sid = jsonData[0]._id;
                model.create(jsonData[0], (err, res) => {
                  if(err) {return reject(err);}
                  return resolve(res); 
                });
              });
            });
  }

  describe('Licensing', function() {
    let RayUser, RayProjProfile, RayMedia;
    const User = app.models.user;
    const Media = app.models.media;                
    const ProjProfile = app.models.projProfile;    

    function reverseString(str){
      return str.split('').reverse().join('');
    }

    function genSignatureSync(timestamp, apiKey, resource){
      const isOdd = (timestamp % 2);
      const bcryptPlain = isOdd ?
                          `${timestamp}${apiKey}${resource}${reverseString(timestamp.toString())}` :
                          `${timestamp}${reverseString(resource)}${apiKey}${timestamp}`;
      // gen signature
      let bcryptSalt = bcrypt.genSaltSync(10);
      return bcrypt.hashSync(bcryptPlain, bcryptSalt);
    }

    before(function(done) {
    //TODO: this part may be merged with fixture & fixtureLoader
      P.all([ insertSampleAsync(__dirname + '/fixtures/user.json', User),
              insertSampleAsync(__dirname + '/fixtures/media.json', Media),
              insertSampleAsync(__dirname + '/fixtures/projProfile.json', ProjProfile)
      ])
      .then((res)=>{
        RayUser = res[0];
        RayMedia = res[1];
        RayProjProfile = res[2];
        done();
      })
      .catch((err) => {done(err);});
    });

    it('return 200 and verification when timestamp is "even" and signature is legal', function(done) {
      const dateStr = 'Mon Apr 24 2017 15:43:38 GMT+0800 (CST)';
      let date = new Date(dateStr);
      let timestamp = parseInt(date.getTime() / 1000, 10);
      let quality = RayMedia.content.quality[0].size;
      let apiKey = RayProjProfile.sid;
      let resource = '/media/'+RayMedia.sid+'/'+quality;
      const signature = genSignatureSync(timestamp, apiKey, resource);
      json('get', endpoint+'/'+RayMedia.sid+'/'+quality)
      .set('X-Date', dateStr)
      .set('Authorization', 'VERPIX '+apiKey+':'+signature)
      .expect(200, (err, res) => {
        if(err){return done(err);}
        assert.equal(res.body.result.sid, RayMedia.sid);
        assert.equal(res.body.result.status, 'completed');
        res.header.should.have.property('x-date');
        const verification = res.body.result.verification;
        const resDate = new Date(res.header['x-date']);
        const resTimestamp = parseInt(resDate.getTime()/1000, 10);
        assert(isVerified(verification, apiKey, resource, resTimestamp));
        return done();
      });
    });

    it('return 200 and verification when timestamp is "odd" and signature is legal', function(done) {
      const dateStr = 'Mon Apr 24 2017 15:43:39 GMT+0800 (CST)';
      let date = new Date(dateStr);
      let timestamp = parseInt(date.getTime() / 1000, 10);
      let quality = RayMedia.content.quality[0].size;
      let apiKey = RayProjProfile.sid;
      let resource = '/media/'+RayMedia.sid+'/'+quality;
      const signature = genSignatureSync(timestamp, apiKey, resource);
      json('get', endpoint+'/'+RayMedia.sid+'/'+quality)
      .set('X-Date', dateStr)
      .set('Authorization', 'VERPIX '+apiKey+':'+signature)
      .expect(200, (err, res) => {
        if(err){return done(err);}
        assert.equal(res.body.result.sid, RayMedia.sid);
        assert.equal(res.body.result.status, 'completed');
        res.header.should.have.property('x-date');
        const verification = res.body.result.verification;
        const resDate = new Date(res.header['x-date']);
        const resTimestamp = parseInt(resDate.getTime()/1000, 10);
        assert(isVerified(verification, apiKey, resource, resTimestamp));
        return done();
      });
    });

    it('return 200 without verification when there is no authorization in req (not for SDK)', function(done) {
      const dateStr = 'Mon Apr 24 2017 15:43:39 GMT+0800 (CST)';
      let date = new Date(dateStr);
      let timestamp = parseInt(date.getTime() / 1000, 10);
      let quality = RayMedia.content.quality[0].size;
      let apiKey = RayProjProfile.sid;
      let resource = '/media/'+RayMedia.sid+'/'+quality;
      const signature = genSignatureSync(timestamp, apiKey, resource);
      json('get', endpoint+'/'+RayMedia.sid+'/'+quality)
      .set('X-Date', dateStr)
      .expect(200, (err, res) => {
        if(err){return done(err);}
        assert.equal(res.body.result.sid, RayMedia.sid);
        assert.equal(res.body.result.status, 'completed');
        res.header.should.have.not.property('x-date');
        res.body.result.should.not.have.property('verification');
        return done();
      });
    });

    it('return 401 when authorization header not start with "VERPIX"', function(done) {
      const dateStr = 'Mon Apr 24 2017 15:43:39 GMT+0800 (CST)';
      let date = new Date(dateStr);
      let timestamp = parseInt(date.getTime() / 1000, 10);
      let quality = RayMedia.content.quality[0].size;
      let apiKey = RayProjProfile.sid;
      let resource = '/media/'+RayMedia.sid+'/'+quality;
      const signature = genSignatureSync(timestamp, apiKey, resource);
      json('get', endpoint+'/'+RayMedia.sid+'/'+quality)
      .set('X-Date', dateStr)
      .set('Authorization', 'XXX '+apiKey+':'+signature)
      .expect(401, (err, res) => {
        if(err){return done(err);}
        return done();
      });
    });

    it('return 401 when signature is wrong', function(done) {
      const dateStr = 'Mon Apr 24 2017 15:43:39 GMT+0800 (CST)';
      let date = new Date(dateStr);
      let timestamp = parseInt(date.getTime() / 1000, 10);
      let quality = RayMedia.content.quality[0].size;
      let apiKey = RayProjProfile.sid;
      let resource = '/media/'+RayMedia.sid+'/'+quality;
      let signature = genSignatureSync(timestamp, apiKey, resource);
      signature = 'x' + signature.substr(1, signature.length);
      json('get', endpoint+'/'+RayMedia.sid+'/'+quality)
      .set('X-Date', dateStr)
      .set('Authorization', 'XXX '+apiKey+':'+signature)
      .expect(401, (err, res) => {
        if(err){return done(err);}
        return done();
      });
    });
  });
});
