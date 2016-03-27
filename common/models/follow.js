module.exports = function(Follow) {
  Follow.observe('before save', function(ctx, next) {
    if (ctx.instance && ctx.isNewInstance) {
      // on create
      ctx.instance.followAt = new Date();
    }
    next();
  });
};
