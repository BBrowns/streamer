export const SEARCH_MINIMUM_LENGTH = 2;
export const SEARCH_DEBOUNCE_MS = 250;
export const SEARCH_SUGGESTION_LIMIT = 6;

export type SearchInteractionState =
  | "idle"
  | "typing"
  | "loading-suggestions"
  | "suggestions"
  | "loading-results"
  | "results"
  | "no-results"
  | "partial-results"
  | "truncated-results"
  | "no-search-provider"
  | "provider-unavailable"
  | "transport-error";

export interface SearchDebouncer {
  update: (query: string) => void;
  cancel: () => void;
}

export function normalizeSearchQueryInput(query: string) {
  return query.trim().replace(/\s+/g, " ");
}

export function isCurrentSearchQuery(current: string, requested: string) {
  return (
    normalizeSearchQueryInput(current) === normalizeSearchQueryInput(requested)
  );
}

export function shouldShowSearchSuggestions(
  input: string,
  submitted: string,
  state: SearchInteractionState,
) {
  const cleanInput = normalizeSearchQueryInput(input);
  return (
    cleanInput.length >= SEARCH_MINIMUM_LENGTH &&
    cleanInput !== normalizeSearchQueryInput(submitted) &&
    state !== "typing" &&
    state !== "idle"
  );
}

export function moveSearchSelection(
  current: number,
  itemCount: number,
  direction: "next" | "previous",
) {
  if (itemCount <= 0) return -1;
  if (current < 0) return direction === "next" ? 0 : itemCount - 1;
  const delta = direction === "next" ? 1 : -1;
  return (current + delta + itemCount) % itemCount;
}

export function getSearchSelectionDirection(
  key: string | undefined,
): "next" | "previous" | undefined {
  if (key === "ArrowDown") return "next";
  if (key === "ArrowUp") return "previous";
  return undefined;
}

export function getSearchShortcutLabel(platform: string | undefined) {
  return /Mac|iPhone|iPad|iPod/i.test(platform ?? "") ? "⌘K" : "Ctrl K";
}

export function resolveCommandPaletteAction(input: {
  deliberatelyNavigated: boolean;
  selectedIndex: number;
  suggestionCount: number;
}): { kind: "suggestion"; index: number } | { kind: "all-results" } {
  if (
    input.deliberatelyNavigated &&
    input.selectedIndex >= 0 &&
    input.selectedIndex < input.suggestionCount
  ) {
    return { kind: "suggestion", index: input.selectedIndex };
  }
  return { kind: "all-results" };
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
      const clean = normalizeSearchQueryInput(query);
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
