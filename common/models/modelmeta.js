var assert = require('assert');

module.exports = function(Modelmeta) {

  Modelmeta.afterRemote('*.__get__files', function(ctx, instance, next) {
    if (ctx.result) {
      var result = ctx.result;
      assert(Array.isArray(result));

      var files = {};
      result.forEach(function(file) {
        files[file.name] = file.url;
      });
      ctx.result = files;
    }
    next();
  });

  Modelmeta.afterRemote('findById', function(ctx, model, next) {
    if (ctx.result) {
      if (typeof ctx.result === 'object') {
        if (ctx.result['__data'].hasOwnProperty('nodeList')) {
          var result = ctx.result;
          var nodes = {};
          result.nodeList.forEach(function(node) {
            var nodeId = node.sid;
            delete node['__data'].sid;
            nodes[nodeId] = node;
          });
          result.nodes = nodes;
          ctx.result = result;
          delete ctx.result['__data'].nodeList;
        }
      }
    }
    next();
  });
};
