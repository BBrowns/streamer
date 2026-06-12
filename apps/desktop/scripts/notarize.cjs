const { notarize } = require("@electron/notarize");

function hasAppSpecificPasswordCredentials(env) {
  return Boolean(env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID);
}

function hasApiKeyCredentials(env) {
  return Boolean(env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER);
}

exports.default = async function notarizeMacosBuild(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== "darwin") {
    return;
  }

  const env = process.env;
  const shouldNotarize = env.STREAMER_NOTARIZE === "true";
  if (!shouldNotarize) {
    console.log("[desktop] Skipping notarization because STREAMER_NOTARIZE is not true.");
    return;
  }

  const appName = packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;
  const appBundleId = packager.appInfo.appId;

  if (hasApiKeyCredentials(env)) {
    console.log(`[desktop] Notarizing ${appName} with Apple API key credentials.`);
    await notarize({
      appBundleId,
      appPath,
      appleApiKey: env.APPLE_API_KEY,
      appleApiKeyId: env.APPLE_API_KEY_ID,
      appleApiIssuer: env.APPLE_API_ISSUER,
    });
    return;
  }

  if (hasAppSpecificPasswordCredentials(env)) {
    console.log(`[desktop] Notarizing ${appName} with Apple ID credentials.`);
    await notarize({
      appBundleId,
      appPath,
      appleId: env.APPLE_ID,
      appleIdPassword: env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: env.APPLE_TEAM_ID,
    });
    return;
  }

  throw new Error(
    "STREAMER_NOTARIZE=true requires either APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER or APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID.",
  );
};
