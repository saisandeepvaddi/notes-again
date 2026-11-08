const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

const WINDOW_BLOCK = /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;

function adoptScenes(contents) {
  if (contents.includes("class SceneDelegate")) return contents;
  const next = contents
    .replace(
      "class AppDelegate: ExpoAppDelegate {",
      "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {",
    )
    .replace(WINDOW_BLOCK, "\n");
  if (next === contents || WINDOW_BLOCK.test(next) || !next.includes("ExpoReactNativeFactoryProvider")) {
    throw new Error("with-scene-lifecycle: AppDelegate.swift doesn't match the expected template.");
  }
  return `${next}\nclass SceneDelegate: ExpoAppSceneDelegate {}\n`;
}

module.exports = function withSceneLifecycle(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return mod;
  });
  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== "swift") {
      throw new Error("with-scene-lifecycle expects a Swift AppDelegate.");
    }
    mod.modResults.contents = adoptScenes(mod.modResults.contents);
    return mod;
  });
};
