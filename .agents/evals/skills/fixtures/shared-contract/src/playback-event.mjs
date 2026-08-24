export function parsePlaybackEvent(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("playback event must be an object");
  }
  if (typeof input.type !== "string" || input.type.length === 0) {
    throw new TypeError("type must be a non-empty string");
  }
  for (const key of Object.keys(input)) {
    if (key !== "type") throw new TypeError(`unknown field ${key}`);
  }
  return { type: input.type };
}
