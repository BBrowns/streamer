if (
  typeof window !== "undefined" &&
  window.location.protocol === "file:" &&
  /\/renderer\/index\.html$/.test(window.location.pathname)
) {
  window.history.replaceState(null, "", "/");
}

require("expo-router/entry");
