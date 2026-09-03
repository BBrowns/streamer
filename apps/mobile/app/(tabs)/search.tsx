import { SearchScreen } from "../../components/search/SearchScreen";
import { RouteAccessibilityBoundary } from "../../components/ui/RouteAccessibilityBoundary";

export default function SearchRoute() {
  return (
    <RouteAccessibilityBoundary>
      <SearchScreen />
    </RouteAccessibilityBoundary>
  );
}
