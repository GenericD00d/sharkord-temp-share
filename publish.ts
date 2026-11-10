import { publish } from "@sharkord/plugin-builder";
import { PLUGIN_SDK_VERSION } from "@sharkord/plugin-sdk";

const result = await publish({
  githubToken: process.env.GITHUB_TOKEN,
  repo: "GenericD00d/sharkord-temp-share",
  // true would also open a listing PR on Sharkord/plugins
  pr: false,
  sdkVersion: PLUGIN_SDK_VERSION,
});

console.log("Plugin published successfully", result.releaseUrl);
