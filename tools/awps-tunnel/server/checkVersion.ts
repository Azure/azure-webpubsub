import axios from "axios";
import * as semver from "semver";
import packageJson from "./package.json";
import { printer } from "./output";
async function getLatestVersion(): Promise<string | null> {
  try {
    const name = packageJson.name;
    const response = await axios.get(`https://registry.npmjs.org/${name}`);
    const latestVersion: string = response.data["dist-tags"].latest;
    return latestVersion;
  } catch (error) {
    printer.warn("Unable to check for updates: ", error);
    return null;
  }
}

async function checkVersion() {
  const latestVersion = await getLatestVersion();
  if (!latestVersion) {
    return;
  }
  const currentVersion = packageJson.version;
  if (semver.gt(latestVersion, currentVersion)) {
    printer.info(`Version ${latestVersion} is available. Run "npm update ${packageJson.name}" or "yarn upgrade ${packageJson.name}" to update the package to the latest version.`);
  }
}

export { checkVersion };
