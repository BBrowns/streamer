/** Add-on manifest describing its capabilities */
export interface CatalogExtra {
  name: string;
  isRequired?: boolean;
  options?: string[];
}

export interface CatalogDefinition {
  type: string;
  id: string;
  name: string;
  extra?: CatalogExtra[];
}

export interface ResourceDefinition {
  name: string;
  types?: string[];
  idPrefixes?: string[];
}

export interface AddonManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  logo?: string;
  resources: (string | ResourceDefinition)[];
  types: string[];
  catalogs: CatalogDefinition[];
  idPrefixes?: string[];
}

/** Stored add-on record in the database */
export interface InstalledAddon {
  id: string;
  userId: string;
  transportUrl: string;
  manifest: AddonManifest;
  installedAt: string;
}
