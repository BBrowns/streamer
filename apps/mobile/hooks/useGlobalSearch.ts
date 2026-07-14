import { useEffect, useMemo, useState } from "react";
import {
  SEARCH_SUGGESTION_LIMIT,
  createSearchDebouncer,
} from "../services/searchController";
import { useSearch } from "./useSearch";

/** Debounced type-ahead search shared by Search and the command palette. */
export function useGlobalSearch(query: string) {
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const controller = useMemo(
    () => createSearchDebouncer(setDebouncedQuery),
    [],
  );

  useEffect(() => {
    controller.update(query);
    return controller.cancel;
  }, [controller, query]);

  const result = useSearch(debouncedQuery, {
    minimumLength: 2,
    limit: SEARCH_SUGGESTION_LIMIT,
  });

  return {
    ...result,
    debouncedQuery,
    isDebouncing:
      query.trim().length >= 2 && query.trim() !== debouncedQuery.trim(),
  };
}
