/**
 * @param {Function} fn
 * @param {number} limit
 */
export function throttle(fn, limit) {
  let throttled = false;

  /**
   * @param {any[]} args
   */
  return function (...args) {
    if (!throttled) {
      throttled = true;
      setTimeout(() => {
        throttled = false;
        fn(...args);
      }, limit);
    }
  };
}
