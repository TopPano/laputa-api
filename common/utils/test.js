var VerpixId = require('./verpix-id-gen');
var async = require('async');
var idGen = new VerpixId();

var ids = new Array(10);
var idStr = new Array(10);
var idTime = new Array(10);
async.times(10, function(n, next) {
  idGen.next(function(err, id) {
    ids[10 - n - 1] = id;
    idStr[10 - n - 1] = id.id;
    idTime[10 - n - 1] = id.timestamp;
    next();
  });
}, function(err) {
  if (err) { return console.log(err); }
  console.log(ids);
  console.log(ids.sort(compare));
  console.log(idStr.sort());
  console.log(idTime.sort());
  if (ids[1].id > ids[2].id) {
    console.log('ids[1]: '+ids[1].id+' is bigger than id[2]: '+ids[2].id);
  }
});

function compare(a, b) {
  if (a.id > b.id)
    return -1;
  else if (a.id < b.id)
    return 1;
  else
    return 0;
}

