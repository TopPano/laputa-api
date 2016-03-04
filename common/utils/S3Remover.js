var AWS = require('aws-sdk');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

function S3Remover() {
  var _this = this;
  var EVENT_SUCCESS = 'success',
      EVENT_ERROR = 'error',
      EVENT_PROGRESS = 'progress';

  S3Remover.prototype.remove = function(params) {
    var s3RemoveParams = {
      Bucket: params['Bucket'] || process.env.S3_BKT,
      Key: params.Key
    };
    var s3 = new AWS.S3();
    var remover = s3.deleteObject(s3RemoveParams);

    // Start removing an object in S3 bucket.
    remover.send(function(err, data) {
      if(err) {
        // Error while deleting an object.
        _this.emit(EVENT_ERROR, err);
      } else {
        // Success deleting an object.
        // We should notice that it return success even the object key does not exist.
        _this.emit(EVENT_SUCCESS, data);
      }
    });

    return _this;
  };
}

util.inherits(S3Remover, EventEmitter);

module.exports = S3Remover;

