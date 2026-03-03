import type { AddonManifest, InstalledAddon } from "@streamer/shared";

/** Port: Add-on persistence operations */
export interface IAddonRepository {
  findById(id: string): Promise<AddonRecord | null>;
  findByUserAndUrl(
    userId: string,
    transportUrl: string,
  ): Promise<AddonRecord | null>;
  findAllByUser(userId: string): Promise<AddonRecord[]>;
  create(data: {
    userId: string;
    transportUrl: string;
    manifest: AddonManifest;
  }): Promise<AddonRecord>;
  delete(id: string): Promise<void>;
}

/** Port: Fetching manifest from external add-on transport URL */
export interface IAddonTransport {
  fetchManifest(transportUrl: string): Promise<AddonManifest>;
}

/** Internal domain record for an installed add-on */
export interface AddonRecord {
  id: string;
  userId: string;
  transportUrl: string;
  manifest: AddonManifest;
  installedAt: Date;
}
