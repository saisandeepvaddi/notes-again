const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const webSource = path.resolve(__dirname, "../frontend/src");
const appRoot = path.join(__dirname, "package.json");

config.watchFolders = [...config.watchFolders, webSource];

const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const fromWeb = context.originModulePath.startsWith(webSource + path.sep);
  const bare = !moduleName.startsWith(".") && !path.isAbsolute(moduleName);
  const next = fromWeb && bare ? { ...context, originModulePath: appRoot } : context;
  return (resolveRequest ?? context.resolveRequest)(next, moduleName, platform);
};

module.exports = config;
