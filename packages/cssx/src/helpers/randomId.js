var ids = 0;

module.exports = function () {
  return '_cssx' + (++ids);
};
module.exports.resetIDs = function () {
  ids = 0;
};
