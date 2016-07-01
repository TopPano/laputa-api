(function() {
  'use strict';

  function formatLikeList(list, queryIssuerId) {
    var likes = {
      count: (list && Array.isArray(list)) ? list.length : 0,
      isLiked: queryIssuerId ? Boolean(list.find(function(like) { return like.userId === queryIssuerId; })) : false
    };
    return likes;
  }

  module.exports = {
    formatLikeList: formatLikeList
  };
})();
