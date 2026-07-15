import React from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { legacySearchRedirectParams } from "../../services/searchState";

/** Compatibility route: Search now has one canonical destination. */
export default function LegacySearchResultsRedirect() {
  const params = useLocalSearchParams();
  return (
    <Redirect
      href={{
        pathname: "/search",
        params: legacySearchRedirectParams(params) as any,
      }}
    />
  );
}
