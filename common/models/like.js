module.exports = function(Like) {
  Like.observe('before save', function(ctx, next) {
    if (ctx.instance && ctx.isNewInstance) {
      // on create
      ctx.instance.likeAt = new Date();
    }
    next();
  });
};
