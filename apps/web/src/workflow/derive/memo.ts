/**
 * Remember the last call. Derivations run during render on one state at a time, so "same
 * arguments as last time" is the whole cache; a new state object recomputes only the steps
 * whose own inputs changed.
 */
export function memoLast<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let last: { args: A; result: R } | undefined;
  return (...args: A): R => {
    if (
      last !== undefined &&
      last.args.length === args.length &&
      last.args.every((a, i) => Object.is(a, args[i]))
    ) {
      return last.result;
    }
    const result = fn(...args);
    last = { args, result };
    return result;
  };
}
