var AWS = require('aws-sdk');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

function S3Remover() {
  var _this = this;
  var EVENT_SUCCESS = 'success',
      EVENT_ERROR = 'error',
      EVENT_PROGRESS = 'progress';

  S3Remover.prototype.remove = function(params) {
    var s3 = new AWS.S3();
    var remover;
    var s3RemoveParams = {
      Bucket: params.Bucket || process.env.S3_BKT
    };

    if(util.isArray(params.Key)) {
      // Key is an array.
      s3RemoveParams.Delete = {
        Objects: [],
        Quiet: false
      };
      params.Key.forEach(function(key) {
        if(typeof key === 'string') {
          s3RemoveParams.Delete.Objects.push({ Key: key });
        }
      });
      remover = s3.deleteObjects(s3RemoveParams);
    } else if(typeof params.Key === 'string') {
      // Key is a string.
      s3RemoveParams.Key = params.Key;
      remover = s3.deleteObject(s3RemoveParams);
    } else {
      // TODO: Error handling for wrong type of Key.
    }

    // Start removing object(s) in S3 bucket.
    remover.send(function(err, data) {
      if(err) {
        // Error while deleting object(s).
        _this.emit(EVENT_ERROR, err);
      } else {
        // Successfully deleting object(s).
        // We should notice that it return success even the object key does not exist.
        _this.emit(EVENT_SUCCESS, data);
      }
    });

    return _this;
  };
};

util.inherits(S3Remover, EventEmitter);

module.exports = S3Remover;

