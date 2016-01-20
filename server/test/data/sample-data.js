var async = require('async');

module.exports = function(app, callback) {
  var User = app.models.user;
  var Post = app.models.post;
  var File = app.models.file;

  var users = [
    {
      username: 'paco',
      email: 'papayabird@toppano.in',
      password: 'password'
    }
  ];
  var posts = [
    {
      image: '',
      message: 'It is just an office',
      address: '10F., No.3-2-H, Park St., Nangang Dist., Taipei City 115, Taiwan (R.O.C.)',
      geolocation: '25.0835017,121.5903754'
    }
  ];
  var nodes = [
    {
      heading: 90,
      thumbnailUrl: 'http://localhost:3000/posts/0/beef/pan/thumb/2015-12-30/1.jpg',
      srcUrl: 'http://localhost:3000/posts/0/beef/pan/src/2015-12-30/1.jpg',
      srcDownloadUrl: 'http://localhost:3000/posts/0/beef/pan/src/2015-12-30/1.jpg',
      srcMobileUrl: 'http://localhost:3000/posts/0/beef/pan/src/2015-12-30/1_low.jpg',
      srcMobileDownloadUrl: 'http://localhost:3000/posts/0/beef/pan/src/2015-12-30/1_low.jpg',
      files: [
        '/pan/thumb/1.jpg;http://localhost:3000/posts/0/beef/pan/thumb/2015-12-30/1.jpg',
        '/pan/high/1_equirectangular_0.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/1_equirectangular_0.jpg',
        '/pan/high/1_equirectangular_1.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/1_equirectangular_1.jpg',
        '/pan/high/1_equirectangular_2.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/1_equirectangular_2.jpg',
        '/pan/high/1_equirectangular_3.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/1_equirectangular_3.jpg',
        '/pan/high/1_equirectangular_4.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/1_equirectangular_4.jpg',
        '/pan/high/1_equirectangular_5.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/1_equirectangular_5.jpg',
        '/pan/high/1_equirectangular_6.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/1_equirectangular_6.jpg',
        '/pan/high/1_equirectangular_7.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/1_equirectangular_7.jpg',
        '/pan/low/1_equirectangular_0.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/1_equirectangular_0.jpg',
        '/pan/low/1_equirectangular_1.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/1_equirectangular_1.jpg',
        '/pan/low/1_equirectangular_2.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/1_equirectangular_2.jpg',
        '/pan/low/1_equirectangular_3.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/1_equirectangular_3.jpg',
        '/pan/low/1_equirectangular_4.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/1_equirectangular_4.jpg',
        '/pan/low/1_equirectangular_5.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/1_equirectangular_5.jpg',
        '/pan/low/1_equirectangular_6.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/1_equirectangular_6.jpg',
        '/pan/low/1_equirectangular_7.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/1_equirectangular_7.jpg'
      ]
    },
    {
      heading: 90,
      thumbnailUrl: 'http://localhost:3000/posts/0/beef/pan/thumb/2015-12-30/2.jpg',
      srcUrl: 'http://localhost:3000/posts/0/beef/pan/src/2015-12-30/2.jpg',
      srcDownloadUrl: 'http://localhost:3000/posts/0/beef/pan/src/2015-12-30/2.jpg',
      srcMobileUrl: 'http://localhost:3000/posts/0/beef/pan/src/2015-12-30/2_low.jpg',
      srcMobileDownloadUrl: 'http://localhost:3000/posts/0/beef/pan/src/2015-12-30/2_low.jpg',
      files: [
        '/pan/thumb/2.jpg;http://localhost:3000/posts/0/beef/pan/thumb/2015-12-30/2.jpg',
        '/pan/high/2_equirectangular_0.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/2_equirectangular_0.jpg',
        '/pan/high/2_equirectangular_1.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/2_equirectangular_1.jpg',
        '/pan/high/2_equirectangular_2.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/2_equirectangular_2.jpg',
        '/pan/high/2_equirectangular_3.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/2_equirectangular_3.jpg',
        '/pan/high/2_equirectangular_4.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/2_equirectangular_4.jpg',
        '/pan/high/2_equirectangular_5.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/2_equirectangular_5.jpg',
        '/pan/high/2_equirectangular_6.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/2_equirectangular_6.jpg',
        '/pan/high/2_equirectangular_7.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/2_equirectangular_7.jpg',
        '/pan/low/2_equirectangular_0.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/2_equirectangular_0.jpg',
        '/pan/low/2_equirectangular_1.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/2_equirectangular_1.jpg',
        '/pan/low/2_equirectangular_2.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/2_equirectangular_2.jpg',
        '/pan/low/2_equirectangular_3.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/2_equirectangular_3.jpg',
        '/pan/low/2_equirectangular_4.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/2_equirectangular_4.jpg',
        '/pan/low/2_equirectangular_5.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/2_equirectangular_5.jpg',
        '/pan/low/2_equirectangular_6.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/2_equirectangular_6.jpg',
        '/pan/low/2_equirectangular_7.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/2_equirectangular_7.jpg'
      ]
    },
    {
      heading: 90,
      thumbnailUrl: 'http://localhost:3000/posts/0/beef/pan/thumb/2015-12-30/3.jpg',
      srcUrl: 'http://localhost:3000/posts/0/beef/pan/src/2015-12-30/3.jpg',
      srcDownloadUrl: 'http://localhost:3000/posts/0/beef/pan/src/2015-12-30/3.jpg',
      srcMobileUrl: 'http://localhost:3000/posts/0/beef/pan/src/2015-12-30/3_low.jpg',
      srcMobileDownloadUrl: 'http://localhost:3000/posts/0/beef/pan/src/2015-12-30/3_low.jpg',
      files: [
        '/pan/thumb/3.jpg;http://localhost:3000/posts/0/beef/pan/thumb/2015-12-30/3.jpg',
        '/pan/high/3_equirectangular_0.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/3_equirectangular_0.jpg',
        '/pan/high/3_equirectangular_1.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/3_equirectangular_1.jpg',
        '/pan/high/3_equirectangular_2.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/3_equirectangular_2.jpg',
        '/pan/high/3_equirectangular_3.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/3_equirectangular_3.jpg',
        '/pan/high/3_equirectangular_4.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/3_equirectangular_4.jpg',
        '/pan/high/3_equirectangular_5.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/3_equirectangular_5.jpg',
        '/pan/high/3_equirectangular_6.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/3_equirectangular_6.jpg',
        '/pan/high/3_equirectangular_7.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/3_equirectangular_7.jpg',
        '/pan/low/3_equirectangular_0.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/3_equirectangular_0.jpg',
        '/pan/low/3_equirectangular_1.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/3_equirectangular_1.jpg',
        '/pan/low/3_equirectangular_2.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/3_equirectangular_2.jpg',
        '/pan/low/3_equirectangular_3.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/3_equirectangular_3.jpg',
        '/pan/low/3_equirectangular_4.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/3_equirectangular_4.jpg',
        '/pan/low/3_equirectangular_5.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/3_equirectangular_5.jpg',
        '/pan/low/3_equirectangular_6.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/3_equirectangular_6.jpg',
        '/pan/low/3_equirectangular_7.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/3_equirectangular_7.jpg',
      ]
    },
    {
      heading: 90,
      thumbnailUrl: 'http://localhost:3000/posts/0/beef/pan/thumb/2015-12-30/4.jpg',
      srcUrl: 'http://localhost:3000/posts/0/beef/pan/src/2015-12-30/4.jpg',
      srcDownloadUrl: 'http://localhost:3000/posts/0/beef/pan/src/2015-12-30/4.jpg',
      srcMobileUrl: 'http://localhost:3000/posts/0/beef/pan/src/2015-12-30/4_low.jpg',
      srcMobileDownloadUrl: 'http://localhost:3000/posts/0/beef/pan/src/2015-12-30/4_low.jpg',
      files: [
        '/pan/thumb/4.jpg;http://localhost:3000/posts/0/beef/pan/thumb/2015-12-30/4.jpg',
        '/pan/high/4_equirectangular_0.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/4_equirectangular_0.jpg',
        '/pan/high/4_equirectangular_1.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/4_equirectangular_1.jpg',
        '/pan/high/4_equirectangular_2.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/4_equirectangular_2.jpg',
        '/pan/high/4_equirectangular_3.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/4_equirectangular_3.jpg',
        '/pan/high/4_equirectangular_4.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/4_equirectangular_4.jpg',
        '/pan/high/4_equirectangular_5.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/4_equirectangular_5.jpg',
        '/pan/high/4_equirectangular_6.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/4_equirectangular_6.jpg',
        '/pan/high/4_equirectangular_7.jpg;http://localhost:3000/posts/0/beef/pan/high/2015-12-30/4_equirectangular_7.jpg',
        '/pan/low/4_equirectangular_0.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/4_equirectangular_0.jpg',
        '/pan/low/4_equirectangular_1.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/4_equirectangular_1.jpg',
        '/pan/low/4_equirectangular_2.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/4_equirectangular_2.jpg',
        '/pan/low/4_equirectangular_3.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/4_equirectangular_3.jpg',
        '/pan/low/4_equirectangular_4.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/4_equirectangular_4.jpg',
        '/pan/low/4_equirectangular_5.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/4_equirectangular_5.jpg',
        '/pan/low/4_equirectangular_6.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/4_equirectangular_6.jpg',
        '/pan/low/4_equirectangular_7.jpg;http://localhost:3000/posts/0/beef/pan/low/2015-12-30/4_equirectangular_7.jpg',
      ]
    }
  ];
  User.create(users[0], function(err, newUser) {
    if (err) { return callback(err); }
    console.log('User created: '+newUser.username);
    posts[0].ownerId = newUser.sid;
    Post.create(posts[0], function(err, newPost) {
      if (err) { return callback(err); }
      console.log('post created: %s ', newPost.sid);
      async.each(nodes, function(node, callback) {
        newPost.nodes.create({
          heading: node.heading,
          enabled: node.enabled,
          thumbnailUrl: node.thumbnailUrl,
          srcUrl: node.srcUrl,
          srcDownloadUrl: node.srcDownloadUrl,
          srcMobileUrl: node.srcMobileUrl,
          srcMobileDownloadUrl: node.srcMobileDownloadUrl
        }, function(err, newNode) {
          if (err) { return callback(err); }
          console.log('Node (%s) created for post "%s"', node.sid, newPost.sid);
          async.each(node.files, function(file, callback) {
            var name = file.split(';')[0];
            var url = file.split(';')[1];
            // replace the fake node id before we actually create the
            // Post instance
            var fakeId = null, re = null;
            if (name.indexOf('high') !== -1 ||
                name.indexOf('low') !== -1) {
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
              postId: newPost.sid,
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
