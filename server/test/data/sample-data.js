var async = require('async');

module.exports = function(app, callback) {
  var User = app.models.user;
  var Modelmeta = app.models.modelmeta;
  var File = app.models.file;

  var users = [
    {
      username: 'paco',
      email: 'papayabird@toppano.in',
      password: 'password'
    }
  ];
  var models = [
    {
      name: 'NKO Office',
      status: 'public',
      image: '',
      viewerOptions: {
        description: true,
        map: false,
        share: true,
        presentedBy: true
      },
      presentedBy: 'Paco',
      address: '10F., No.3-2-H, Park St., Nangang Dist., Taipei City 115, Taiwan (R.O.C.)',
      geolocation: '25.0835017,121.5903754',
      description: 'It is just an office'
    }
  ];
  var nodes = [
    {
      tag: 'image1',
      heading: 90,
      enabled: true,
      thumbnailUrl: 'http://localhost:3000/images/models/0/beef/pan/thumb/2015-12-30/1.jpg',
      srcUrl: 'http://localhost:3000/images/models/0/beef/pan/src/2015-12-30/1.jpg',
      files: [
        '/pan/thumb/2015-12-30/1.jpg;http://localhost:3000/images/models/0/beef/pan/thumb/2015-12-30/1.jpg',
        '/pan/high/2015-12-30/1_equirectangular_0.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/1_equirectangular_0.jpg',
        '/pan/high/2015-12-30/1_equirectangular_1.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/1_equirectangular_1.jpg',
        '/pan/high/2015-12-30/1_equirectangular_2.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/1_equirectangular_2.jpg',
        '/pan/high/2015-12-30/1_equirectangular_3.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/1_equirectangular_3.jpg',
        '/pan/high/2015-12-30/1_equirectangular_4.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/1_equirectangular_4.jpg',
        '/pan/high/2015-12-30/1_equirectangular_5.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/1_equirectangular_5.jpg',
        '/pan/high/2015-12-30/1_equirectangular_6.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/1_equirectangular_6.jpg',
        '/pan/high/2015-12-30/1_equirectangular_7.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/1_equirectangular_7.jpg',
      ]
    },
    {
      tag: 'image2',
      heading: 90,
      enabled: true,
      thumbnailUrl: 'http://localhost:3000/images/models/0/beef/pan/thumb/2015-12-30/2.jpg',
      srcUrl: 'http://localhost:3000/images/models/0/beef/pan/src/2015-12-30/2.jpg',
      files: [
        '/pan/thumb/2015-12-30/2.jpg;http://localhost:3000/images/models/0/beef/pan/thumb/2015-12-30/2.jpg',
        '/pan/high/2015-12-30/2_equirectangular_0.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/2_equirectangular_0.jpg',
        '/pan/high/2015-12-30/2_equirectangular_1.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/2_equirectangular_1.jpg',
        '/pan/high/2015-12-30/2_equirectangular_2.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/2_equirectangular_2.jpg',
        '/pan/high/2015-12-30/2_equirectangular_3.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/2_equirectangular_3.jpg',
        '/pan/high/2015-12-30/2_equirectangular_4.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/2_equirectangular_4.jpg',
        '/pan/high/2015-12-30/2_equirectangular_5.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/2_equirectangular_5.jpg',
        '/pan/high/2015-12-30/2_equirectangular_6.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/2_equirectangular_6.jpg',
        '/pan/high/2015-12-30/2_equirectangular_7.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/2_equirectangular_7.jpg',
      ]
    },
    {
      tag: 'image3',
      heading: 90,
      enabled: true,
      thumbnailUrl: 'http://localhost:3000/images/models/0/beef/pan/thumb/2015-12-30/3.jpg',
      srcUrl: 'http://localhost:3000/images/models/0/beef/pan/src/2015-12-30/3.jpg',
      files: [
        '/pan/thumb/2015-12-30/3.jpg;http://localhost:3000/images/models/0/beef/pan/thumb/2015-12-30/3.jpg',
        '/pan/high/2015-12-30/3_equirectangular_0.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/3_equirectangular_0.jpg',
        '/pan/high/2015-12-30/3_equirectangular_1.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/3_equirectangular_1.jpg',
        '/pan/high/2015-12-30/3_equirectangular_2.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/3_equirectangular_2.jpg',
        '/pan/high/2015-12-30/3_equirectangular_3.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/3_equirectangular_3.jpg',
        '/pan/high/2015-12-30/3_equirectangular_4.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/3_equirectangular_4.jpg',
        '/pan/high/2015-12-30/3_equirectangular_5.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/3_equirectangular_5.jpg',
        '/pan/high/2015-12-30/3_equirectangular_6.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/3_equirectangular_6.jpg',
        '/pan/high/2015-12-30/3_equirectangular_7.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/3_equirectangular_7.jpg',
      ]
    },
    {
      tag: 'image4',
      heading: 90,
      enabled: true,
      thumbnailUrl: 'http://localhost:3000/images/models/0/beef/pan/thumb/2015-12-30/4.jpg',
      srcUrl: 'http://localhost:3000/images/models/0/beef/pan/src/2015-12-30/4.jpg',
      files: [
        '/pan/thumb/2015-12-30/4.jpg;http://localhost:3000/images/models/0/beef/pan/thumb/2015-12-30/4.jpg',
        '/pan/high/2015-12-30/4_equirectangular_0.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/4_equirectangular_0.jpg',
        '/pan/high/2015-12-30/4_equirectangular_1.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/4_equirectangular_1.jpg',
        '/pan/high/2015-12-30/4_equirectangular_2.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/4_equirectangular_2.jpg',
        '/pan/high/2015-12-30/4_equirectangular_3.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/4_equirectangular_3.jpg',
        '/pan/high/2015-12-30/4_equirectangular_4.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/4_equirectangular_4.jpg',
        '/pan/high/2015-12-30/4_equirectangular_5.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/4_equirectangular_5.jpg',
        '/pan/high/2015-12-30/4_equirectangular_6.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/4_equirectangular_6.jpg',
        '/pan/high/2015-12-30/4_equirectangular_7.jpg;http://localhost:3000/images/models/0/beef/pan/high/2015-12-30/4_equirectangular_7.jpg',
      ]
    }
  ];
  User.create(users[0], function(err, newUser) {
    if (err) { return callback(err); }
    console.log('User created: '+newUser.username);
    models[0].ownerId = newUser.sid;
    Modelmeta.create(models[0], function(err, newModel) {
      if (err) { return callback(err); }
      console.log('Model created: (%s) %s ', newModel.sid, newModel.name);
      async.each(nodes, function(node, callback) {
        newModel.nodes.create({
          tag: node.tag,
          heading: node.heading,
          enabled: node.enabled,
          thumbnailUrl: node.thumbnailUrl,
          srcUrl: node.srcUrl
        }, function(err, newNode) {
          if (err) { return callback(err); }
          console.log('Node created: %s for Model "%s"', newNode.tag, newModel.name);
          async.each(node.files, function(file, callback) {
            var name = file.split(';')[0];
            var url = file.split(';')[1];
            // replace the fake node id before we actually create the
            // model instance
            var fakeId = null, re = null;
            if (name.indexOf('high') !== -1) {
              fakeId = name.split('/')[name.split('/').length - 1].split('_')[0];
              re = new RegExp(fakeId+'_');
              name = name.replace(re, newNode.sid+'_');
            } else if (name.indexOf('thumb') !== -1) {
              fakeId = name.split('/')[name.split('/').length - 1].split('.')[0];
              re = new RegExp(fakeId+'.jpg');
              name = name.replace(re, newNode.sid+'.jpg');
            }
            File.create({
              name: name,
              url: url,
              modelId: newModel.sid,
              nodeId: newNode.sid
            }, function(err) {
              if (err) { return callback(err); }
              callback();
            });
          },
          function(err) {
            if (err) { return callback(err); }
            callback();
          });
        });
      },
      function(err) {
        if (err) { return callback(err); }
        callback();
      });
    });
  });
};
