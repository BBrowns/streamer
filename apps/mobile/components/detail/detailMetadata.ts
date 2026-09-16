export function getDetailCountMetadataKey(castType: "movie" | "series") {
  return castType === "series" ? "episodes" : "sources";
}
