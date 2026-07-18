const BETA_VERSION_PATTERN = /-beta(?:\.|$)/;

export function isBetaVersion(version: string) {
  return BETA_VERSION_PATTERN.test(version);
}
