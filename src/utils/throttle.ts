export function throttle(fn: Function, limit: number) {
  let throttled = false;

  return function (...args: Array<unknown>) {
    if (!throttled) {
      throttled = true;
      setTimeout(() => {
        throttled = false;
        fn(...args);
      }, limit);
    }
  };
}
