import { verifyManifestArtifact } from '@mirror/evidence-core';

export { assertTargetAllowed, fingerprint, parseAllowList, TargetBlockedError } from '@mirror/shared';

export function verifyManifestArtifactSafe(expected: string, bytes: Buffer): boolean {
  try {
    return verifyManifestArtifact(expected, bytes);
  } catch {
    return false;
  }
}
