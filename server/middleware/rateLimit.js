const redis = require('redis');
module.exports = function(app) { 
  return function rateLimit(req, res, next) { 
    let projProfile = res.projProfile;
    let reqMedia = res.reqMedia;
    let d = new Date();
    let month = d.getMonth();
    let etcdKey = projProfile.userId+'/'+projProfile.sid+'/'+reqMedia.quality+'/'+month+'/'+d.getTime();
    


    //console.log(etcdKey);
    
    delete res.projProfile;
    delete res.reqMedia;
    
    //console.log('bye', res.projProfile);
    
    next();
  };
};
