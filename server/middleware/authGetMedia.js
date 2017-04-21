module.exports = function(app) { 
  return function authGetMedia(req, res, next) { 
    // TODO:check req.headers.referer is www.verpix.me?
    // check the authentication msg is vaild
    
    //console.log(app.models.user);
    console.log('authGetMedia: test', req.url); 
    // go to next() to get the media metadata
    next();
  };
};
