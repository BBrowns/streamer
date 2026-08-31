export function getSearchResultHeading(query: string) {
  return query.trim();
}

export function getSearchResultCountLabel(
  count: number,
  singular = "result",
  plural = "results",
) {
  return `${count} ${count === 1 ? singular : plural}`;
}
