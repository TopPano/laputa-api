var AWS = require('aws-sdk');
var fs = require('fs');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

function S3Uploader() {
  var _this = this;
  var EVENT_SUCCESS = 'success',
      EVENT_ERROR = 'error',
      EVENT_PROGRESS = 'progress';

  S3Uploader.prototype.send = function(params) {
    var file;
    var accessControlList = 'private',
        contentType = 'image/jpeg',
        storageClass = 'STANDARD';

    if(params['options'] !== undefined) {
      accessControlList = params['options']['ACL'] !== undefined ? params['options']['ACL'] : accessControlList;
      contentType = params['options']['ContentType'] !== undefined ? params['options']['ContentType'] : contentType;
      storageClass = params['options']['StorageClass'] !== undefined ? params['options']['StorageClass'] : storageClass;
    }

    if(typeof params['File'] === 'string') {
      file = fs.createReadStream(params['File']);
      // Error ocuuring while reading file
      file.on('error', function(err) {
        _this.emit(EVENT_ERROR, err);
      });
    } else if(Buffer.isBuffer(params['File'])) {
      file = params['File'];
    }

    var s3UploadParams = {
      Bucket: params['Bucket'] || process.env.S3_BKT,
      Key: params['Key'],
      Body: file,
      ACL: accessControlList,
      ContentType: contentType,
      StorageClass: storageClass
    };
    var s3 = new AWS.S3();
    var uploader = s3.upload(s3UploadParams);

    // Http uploading progress event.
    uploader.on('httpUploadProgress', function(progress) {
      _this.emit(EVENT_PROGRESS, progress);
    });

    // Start uploading file to S3 bucket
    uploader.send(function(err, data) {
      if(err) {
        // Error while uploading a file.
        _this.emit(EVENT_ERROR, err);
      } else {
        // Success uploading a file.
        _this.emit(EVENT_SUCCESS, data);
      }
    });

    return _this;
  };
}

util.inherits(S3Uploader, EventEmitter);

module.exports = S3Uploader;

