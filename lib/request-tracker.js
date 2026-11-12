export function createRequestTracker() {
  let generation = 0;

  return {
    begin() {
      generation += 1;
      return generation;
    },
    current() {
      return generation;
    },
    invalidate() {
      generation += 1;
    },
    isCurrent(token) {
      return token === generation;
    }
  };
}
