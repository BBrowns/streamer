const { resolveMobileAppConfig } = require("./config/mobileAppConfig");

module.exports = ({ config }) => resolveMobileAppConfig(config, process.env);
