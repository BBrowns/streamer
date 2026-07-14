import { Redirect } from "expo-router";

/**
 * Compatibility route for bookmarks and recovery actions created before the
 * categorized settings experience shipped.
 */
export default function SourcesRedirect() {
  return <Redirect href={"/settings/sources" as never} />;
}
