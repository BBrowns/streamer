import axios from "axios";

export interface PendingAddonFlushResult {
  installed: string[];
  alreadyInstalled: string[];
  failed: string[];
}

export function isAlreadyInstalledAddonError(error: unknown) {
  return axios.isAxiosError(error) && error.response?.status === 409;
}

export async function flushPendingAddonUrls(
  urls: string[],
  installAddon: (url: string) => Promise<unknown>,
): Promise<PendingAddonFlushResult> {
  const result: PendingAddonFlushResult = {
    installed: [],
    alreadyInstalled: [],
    failed: [],
  };

  for (const url of urls) {
    try {
      await installAddon(url);
      result.installed.push(url);
    } catch (error) {
      if (isAlreadyInstalledAddonError(error)) {
        result.alreadyInstalled.push(url);
      } else {
        result.failed.push(url);
      }
    }
  }

  return result;
}
