const bcrypt = require('bcryptjs');
const P = require('bluebird');
const bcryptHashAsync = P.promisify(bcrypt.hash);
const createError = require('../../common/utils/http-errors');
const BCRYPT_SALT_ROUND = 5;
//const redisCli = require('redis').createClient(6379, app.get('redisHost'));

module.exports = function(redisCli) {
  return function rateLimit(context, next) { 
    // Function to reverse string
    function reverseString(str) 
    {
      return str.split('').reverse().join('');
    }
    
    function genVerificationMsgAsync(resourceName, apiKey, timestamp)
    {
      // Determine is odd or even from timestamp
      const isOdd = (timestamp % 2);
      // Verification message format depends on the value of timestamp:
      // Timestamp is odd:  'bcrypt($resourceName + reverse($timestamp) + reverse($apiKey) + $timestamp)'
      // Timestamp is even: 'bcrypt(reverse($resourceName) + $timestamp + $apiKey + reverse($timestamp))'
      const plain = isOdd ?
              `${resourceName}${reverseString(timestamp.toString())}${reverseString(apiKey)}${timestamp}` :
              `${reverseString(resourceName)}${timestamp}${apiKey}${reverseString(timestamp.toString())}`;
      // Generate verification message by bcrypt
      return bcryptHashAsync (plain, BCRYPT_SALT_ROUND);
    }

    const res = context.res;
    let projProfile = res.projProfile;
    let reqMedia = res.reqMedia;

    if(projProfile && reqMedia)
    {
      let resourceName = `/media/${reqMedia.id}/${reqMedia.quality}`;
      let apiKey = projProfile.id;
      let d = new Date();
      let timestamp = parseInt(d.getTime() / 1000, 10);
      let month = d.getMonth();
      const etcdKey = projProfile.userId+'/'+projProfile.sid+'/'+reqMedia.quality+'/'+reqMedia.id+'/'+month;
      
      P.all([ genVerificationMsgAsync(resourceName, apiKey, timestamp), 
              redisCli.incr(etcdKey)])
           .then((result) => {
              if(!result[1])
              {
                // redis failed
                // TODO: need to log if fail to push to redisDB
                return next(new createError.InternalServerError());
              }
              res.set('X-Date', d);
              res.set('Access-Control-Expose-Headers', 'x-date');
              context.result.result.verification = result[0]; 
              next();
           })
           .catch(e => {
              // TODO: logger
              next(e);
           });
    }
    else{
      return next();
    }
  };
};
