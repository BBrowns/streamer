export const SEARCH_MINIMUM_LENGTH = 2;
export const SEARCH_DEBOUNCE_MS = 250;
export const SEARCH_SUGGESTION_LIMIT = 6;

export interface SearchDebouncer {
  update: (query: string) => void;
  cancel: () => void;
}

export function moveSearchSelection(
  current: number,
  itemCount: number,
  direction: "next" | "previous",
) {
  if (itemCount <= 0) return -1;
  const delta = direction === "next" ? 1 : -1;
  return (current + delta + itemCount) % itemCount;
}

/** Small framework-agnostic controller so debounce and cancellation are testable. */
export function createSearchDebouncer(
  onReady: (query: string) => void,
  delay = SEARCH_DEBOUNCE_MS,
): SearchDebouncer {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };

  return {
    update(query) {
      cancel();
      const clean = query.trim();
      if (clean.length < SEARCH_MINIMUM_LENGTH) {
        onReady("");
        return;
      }
      timer = setTimeout(() => {
        timer = undefined;
        onReady(clean);
      }, delay);
    },
    cancel,
  };
}
