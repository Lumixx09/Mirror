import fs from 'node:fs/promises';
import path from 'node:path';
import { computeSha256, resolveFromRoot } from '@mirror/shared';
import type { EvidenceManifest } from '@mirror/contracts';

export interface StoredObject {
  sha256: string;
  size: number;
}

export interface StorageDriver {
  put(storageKey: string, data: Buffer | string): Promise<StoredObject>;
  get(storageKey: string): Promise<Buffer>;
  head(storageKey: string): Promise<StoredObject | null>;
  delete(storageKey: string): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
}

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,400}$/;

export class InvalidStorageKeyError extends Error {
  constructor(key: string) {
    super(`Invalid storage key: ${key.slice(0, 80)}`);
    this.name = 'InvalidStorageKeyError';
  }
}

export class LocalStorageDriver implements StorageDriver {
  readonly basePath: string;

  constructor(basePath: string = './storage') {
    this.basePath = resolveFromRoot(basePath);
  }

  /** Keys are relative, segment-safe paths. Traversal and absolute keys are rejected, not rewritten. */
  resolveKey(storageKey: string): string {
    if (!KEY_PATTERN.test(storageKey) || storageKey.split('/').some((seg) => seg === '..' || seg === '.' || seg === '')) {
      throw new InvalidStorageKeyError(storageKey);
    }
    const full = path.resolve(this.basePath, storageKey);
    if (!full.startsWith(this.basePath + path.sep)) throw new InvalidStorageKeyError(storageKey);
    return full;
  }

  async put(storageKey: string, data: Buffer | string): Promise<StoredObject> {
    const fullPath = this.resolveKey(storageKey);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    // Evidence is immutable: never overwrite an existing artifact with different content.
    const existing = await this.head(storageKey);
    const sha256 = computeSha256(buffer);
    if (existing && existing.sha256 !== sha256) {
      throw new Error(`Refusing to overwrite immutable evidence at ${storageKey}`);
    }
    if (!existing) await fs.writeFile(fullPath, buffer, { flag: 'wx' });
    return { sha256, size: buffer.length };
  }

  async get(storageKey: string): Promise<Buffer> {
    return fs.readFile(this.resolveKey(storageKey));
  }

  async head(storageKey: string): Promise<StoredObject | null> {
    try {
      const buffer = await fs.readFile(this.resolveKey(storageKey));
      return { sha256: computeSha256(buffer), size: buffer.length };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await fs.unlink(this.resolveKey(storageKey));
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async exists(storageKey: string): Promise<boolean> {
    return (await this.head(storageKey)) !== null;
  }
}

export function createStorageDriver(): StorageDriver {
  const driver = process.env.STORAGE_DRIVER ?? 'local';
  if (driver !== 'local') {
    throw new Error(`Storage driver "${driver}" is not implemented yet. Use STORAGE_DRIVER=local.`);
  }
  return new LocalStorageDriver(process.env.STORAGE_LOCAL_PATH ?? './storage');
}

export type ManifestArtifact = EvidenceManifest['artifacts'][number];

export function generateManifest(runId: string, artifacts: ManifestArtifact[], generatedAt: string): EvidenceManifest {
  return {
    manifestVersion: 1,
    runId,
    generatedAt,
    artifacts: [...artifacts].sort((a, b) => a.storageKey.localeCompare(b.storageKey))
  };
}

export function verifyManifestArtifact(expectedHash: string, actualBytes: Buffer | string): boolean {
  return computeSha256(actualBytes).toLowerCase() === expectedHash.toLowerCase();
}

export interface ManifestVerification {
  verified: number;
  failed: Array<{ artifactId: string; storageKey: string; reason: string }>;
}

/** Re-hash every artifact in a manifest against storage. */
export async function verifyManifest(manifest: EvidenceManifest, storage: StorageDriver): Promise<ManifestVerification> {
  const result: ManifestVerification = { verified: 0, failed: [] };
  for (const artifact of manifest.artifacts) {
    try {
      const bytes = await storage.get(artifact.storageKey);
      if (verifyManifestArtifact(artifact.sha256, bytes)) result.verified++;
      else result.failed.push({ artifactId: artifact.artifactId, storageKey: artifact.storageKey, reason: 'hash mismatch' });
    } catch {
      result.failed.push({ artifactId: artifact.artifactId, storageKey: artifact.storageKey, reason: 'missing' });
    }
  }
  return result;
}
