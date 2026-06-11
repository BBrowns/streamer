export type BuildRuntimeType =
  | "mobile"
  | "desktop-main"
  | "desktop-renderer"
  | "server"
  | "stream-server";

export type BuildEnvironment =
  | "development"
  | "preview"
  | "production"
  | "test";

export interface BuildMetadata {
  appVersion: string;
  gitSha: string;
  gitShaShort: string;
  buildDate: string;
  buildChannel: string;
  runtimeType: BuildRuntimeType;
  environment: BuildEnvironment;
  release: string;
}

export type BuildEnvSource = Record<string, string | undefined>;
