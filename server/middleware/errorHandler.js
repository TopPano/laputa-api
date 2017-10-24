/*
*  It is copy of strong-remoting's(npm package) errorHandler
*
*
*
*/

module.exports = function(options) {
  options = options || {};
  return function restErrorHandler(err, req, res, next) {
    if (typeof options.handler === 'function') {
      try {
        options.handler(err, req, res, defaultHandler);
      } catch (e) {
        defaultHandler(e);
      }
    } else {
      return defaultHandler();
    }

    function defaultHandler(handlerError) {
      if (handlerError) {
        // ensure errors that occurred during
        // the handler are reported
        err = handlerError;
      }
      if (typeof err === 'string') {
        err = new Error(err);
        err.status = err.statusCode = 500;
      }

      if (res.statusCode === undefined || res.statusCode < 400) {
        res.statusCode = err.statusCode || err.status || 500;
      }

      if (Array.isArray(err)) {
        var details = err.map(function(it) {
          var data = generateResponseError(it);
          delete data.statusCode;
          return data;
        });

        var msg = 'Failed with multiple errors, see `details` for more information.';
        err = new Error(msg);
        err.details = details;
      }

      res.send({ error: generateResponseError(err) });

      function generateResponseError(error) {
        var data = {
          name: error.name,
          status: res.statusCode,
          message: error.message || 'An unknown error occurred',
        };

        for (var prop in error) {
          data[prop] = error[prop];
        }

        data.stack = error.stack;
        if (process.env.NODE_ENV === 'production' || options.disableStackTrace) {
          delete data.stack;
        }

        return data;
      }
    }
  };
};
