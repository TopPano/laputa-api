const bcrypt = require('bcryptjs');
const pbkdf2 = require('pbkdf2');
const P = require('bluebird');
const logger = require('winston');
const createError = require('../../common/utils/http-errors');

const AUTH_MSG_PREFIX = 'VERPIX ';
// Parameters of pbkdf2
const PBKDF2_ITERS = 20;
const PBKDF2_KEY_LENGTH = 32;
const PBKDF2_DIGEST = 'sha512';
const PBKDF2_LENGTH = PBKDF2_KEY_LENGTH * 2;
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
const pbkdf2CompareAsync = P.promisify(pbkdf2Compare);

// Function to compare the pbkdf2-hashed value
function pbkdf2Compare(plainText, hashed, salt, callback) {
  // Construct the expected hashed value, the output of pbkdf2 is Uint8Array,
  // we convert it to hexadecimal string
  const expectedHashed = pbkdf2.pbkdf2(
    plainText, salt, PBKDF2_ITERS, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST,
    (err, key) => {
      if (err) throw err;
      callback(null, (hashed === key.toString('hex')));
    });
}


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
      // Timestamp is odd:  'bcrypt($timestamp + $apiKey) + pbkdf2($resourceName + $timestamp)'
      // Timestamp is even: 'bcrypt($timestamp + reverse($timestamp)) + pbkdf2($apiKey + $timestamp)'
      if (signature.length !== (BCRYPT_LENGTH + PBKDF2_LENGTH)) 
      {
        // signature.length must be equal to BCRYPT_LENGTH + PBKDF2_LENGTH
        return next(new createError.Unauthorized('SDK Unauthorized'));
      }
      // Extract the bcrypt-hashed part
      const bcryptHashed = signature.slice(0, BCRYPT_LENGTH);
      // Determine the plain text of bcrypt-hash
      const bcryptPlain = isOdd ?
      `${timestamp}${apiKey}` :
      `${timestamp}${reverseString(resourceName)}`;

      // Extract the pbkdf2-hashed part
      const pbkdf2Hashed = signature.slice(BCRYPT_LENGTH);
      // Determine the plain text of pbkdf2-hash
      const pbkdf2Plain = isOdd ?
      `${resourceName}${timestamp}` :
      `${apiKey}${timestamp}`;

      const matchesAsync = [];
      matchesAsync.push(bcryptCompareAsync(bcryptPlain, bcryptHashed));
      matchesAsync.push(pbkdf2CompareAsync(pbkdf2Plain, pbkdf2Hashed, `${timestamp}`));
      return P.all(matchesAsync)
      .then((result) => {
        if (result[0] && result[1])
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
