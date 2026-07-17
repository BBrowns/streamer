import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  SEARCH_SUGGESTION_LIMIT,
  createSearchDebouncer,
  normalizeSearchQueryInput,
} from "../services/searchController";
import { useSearch, type SearchRequestType } from "./useSearch";

/** Debounced type-ahead search shared by Search and the command palette. */
export function useGlobalSearch(
  query: string,
  options: { enabled?: boolean; type?: SearchRequestType } = {},
) {
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const queryClient = useQueryClient();
  const cleanQuery = normalizeSearchQueryInput(query);
  const cleanDebouncedQuery = normalizeSearchQueryInput(debouncedQuery);
  const type = options.type ?? "all";
  const controller = useMemo(
    () => createSearchDebouncer(setDebouncedQuery),
    [],
  );

  useEffect(() => {
    if (
      cleanDebouncedQuery.length >= 2 &&
      (options.enabled === false || cleanDebouncedQuery !== cleanQuery)
    ) {
      void queryClient.cancelQueries({
        queryKey: ["search", cleanDebouncedQuery, "suggestions", type],
      });
    }
    controller.update(options.enabled === false ? "" : cleanQuery);
    return controller.cancel;
  }, [
    cleanDebouncedQuery,
    cleanQuery,
    controller,
    options.enabled,
    queryClient,
    type,
  ]);

  const result = useSearch(debouncedQuery, {
    minimumLength: 2,
    limit: SEARCH_SUGGESTION_LIMIT,
    mode: "suggestions",
    type,
    enabled: options.enabled,
  });

  return {
    ...result,
    debouncedQuery,
    isDebouncing:
      options.enabled !== false &&
      cleanQuery.length >= 2 &&
      cleanQuery !== cleanDebouncedQuery,
  };
}
