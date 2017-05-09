const bcrypt = require('bcryptjs');
const P = require('bluebird');
const logger = require('winston');
const createError = require('../../common/utils/http-errors');

const AUTH_MSG_PREFIX = 'VERPIX ';
// Length of bcrypt-hashed part in authentication message
// According to the following URL, the length of bcrypt-hashed value is 59 or 60
// bytes, and bcryptjs uses "2a" format, so the length is 60 bytes.
// http://stackoverflow.com/questions/5881169/what-column-type-length-should-i-use-for-storing-a-bcrypt-hashed-password-in-a-d
const BCRYPT_LENGTH = 60;

// Function to reverse string
function reverseString(str) {
  return str.split('').reverse().join('');
}

const bcryptCompareAsync = P.promisify(bcrypt.compare);

module.exports = function(model) { 
  return function authGetMedia(req, res, next) { 
    // check the authentication msg is vaild
    // check the "referer" is https://www.verpix.me
    
    const authMsg = req.get('Authorization');
    if(authMsg === undefined)
    { // if yes, it may be from verpix.me => next()
      // it will not response validation key
      next();
    }
    else {
      // if no, it's SDK's apiKey & signature => check the quality is in query => decode => check the apiKey is equal to what decode from signature
      const quality = req.url.replace('/','');
      const mediaId = req.params.id;
      const resourceName = `/media/${mediaId}/${quality}`;
      const date = new Date(req.get('X-Date'));
      // Get timestamp
      const timestamp = parseInt(date.getTime() / 1000, 10);
      // Authentication message format: 'VERPIX $apiKey:$signature'        

      if (!authMsg.startsWith(AUTH_MSG_PREFIX))
      {
        return next(new createError.Unauthorized('SDK Unauthorized'));
      }
      const splittedAuthMsg = authMsg.slice(AUTH_MSG_PREFIX.length).split(':');
      if (splittedAuthMsg.length !== 2)
      {
        // must have 2 value: apiKey & signature
        return next(new createError.Unauthorized('SDK Unauthorized'));
      }
      // Extract API key and signature from authentication message
      const apiKey = splittedAuthMsg[0];
      const signature = splittedAuthMsg[1];
      // Determine is odd or even from timestamp
      const isOdd = (timestamp % 2);
      // Signature format depends on the value of timestamp:
      if (signature.length !== BCRYPT_LENGTH) 
      {
        // signature.length must be equal to BCRYPT_LENGTH + PBKDF2_LENGTH
        return next(new createError.Unauthorized('SDK Unauthorized'));
      }
      // Determine the plain text of bcrypt-hash
      const bcryptPlain = isOdd ?
                `${timestamp}${apiKey}${resourceName}${reverseString(timestamp.toString())}` :
                `${timestamp}${reverseString(resourceName)}${apiKey}${timestamp}`;

      return bcryptCompareAsync(bcryptPlain, signature)
      .then((result) => {
        if (result)
        {
          model.projProfile.findById(apiKey, (err, result) => {
            if(err) 
            {
              //TODO: logger(err)
              return next(new createError.Unauthorized('SDK Unauthorized'));
            }
            if(!result || result.status !== 'legal')
            {  
              return next(new createError.Unauthorized('SDK Unauthorized'));
            }
            res.reqMedia = {id: mediaId, quality: quality};
            res.projProfile = result;
            return next();
          });
        }
        else {
          // signature not match
          return next(new createError.Unauthorized('SDK Unauthorized'));
        }
      });
    }
  };
};
