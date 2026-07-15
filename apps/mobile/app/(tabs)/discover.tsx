import { Redirect } from "expo-router";

/** Compatibility route for bookmarks and older deep links. */
export default function DiscoverRedirect() {
  return <Redirect href="/search?mode=discover" />;
}
