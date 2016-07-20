'use strict';
var gearmanode = require('gearmanode');
var assert = require('assert');
var util = require('util');

var clientInstance = null;

var GearmanClient = function(config) {
  this.config = config || {};
  this.servers = this.config.servers || [ { host: 'localhost', port: 4730 } ];
  this.client = gearmanode.client({ servers: this.servers });
  this.client.jobServers.forEach(function(server) {
    server.setOption('exceptions', function() {});
  });
};

GearmanClient.prototype = {
  submitJob: function (name, params, callback) {
    assert(typeof name === 'string');
    if (typeof params === 'object') {
      params = JSON.stringify(params);
    }
    var job = this.client.submitJob(name, params);
    job.on('complete', function() {
      callback(null, JSON.parse(job.response));
    });
    job.on('socketError', function(serverId, e) {
      callback(new Error(util.format('[ %s ]: onSocketError: server: %s, error: %s', job.name, serverId, e.toString())));
    });
    job.on('jobServerError', function(serverId, code, message) {
      callback(new Error(util.format('[ %s ]: onJobServerError: code: %s, message: %s', serverId, code, message)));
    });
    job.on('error', function(e) {
      callback(new Error(util.format('[ %s ]: onError: %s', job.name, e.toString())));
    });
    job.on('exception', function(e) {
      callback(new Error(util.format('[ %s ]: onException: %s', job.name, e.toString())));
    });
    job.on('timeout', function() {
      callback(new Error(util.format('[ %s ]: job timeout', job.name)));
    });
  }
};

module.exports = {
  factory: function(config) {
    if (!clientInstance) {
      clientInstance = new GearmanClient(config);
    }
    return clientInstance;
  }
};
