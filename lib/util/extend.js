module.exports = function extend(target, source) {
  for (const key in source) {
    if (source[key] !== undefined) {
      target[key] = source[key];
    }
  }
  return target;
};
