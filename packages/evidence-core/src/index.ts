import fs from 'node:fs/promises';
import path from 'node:path';
import { computeSha256 } from '@mirror/shared';
import type { EvidenceManifest } from '@mirror/contracts';

export interface StorageDriver {
  put(storageKey: string, data: Buffer | string): Promise<{ sha256: string; size: number }>;
  get(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
}

export class LocalStorageDriver implements StorageDriver {
  private basePath: string;

  constructor(basePath: string = './storage') {
    this.basePath = path.resolve(basePath);
  }

  private resolveKey(storageKey: string): string {
    const safeKey = storageKey.replace(/\.\./g, '');
    return path.join(this.basePath, safeKey);
  }

  async put(storageKey: string, data: Buffer | string): Promise<{ sha256: string; size: number }> {
    const fullPath = this.resolveKey(storageKey);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    await fs.writeFile(fullPath, buffer);
    return {
      sha256: computeSha256(buffer),
      size: buffer.length
    };
  }

  async get(storageKey: string): Promise<Buffer> {
    const fullPath = this.resolveKey(storageKey);
    return fs.readFile(fullPath);
  }

  async delete(storageKey: string): Promise<void> {
    const fullPath = this.resolveKey(storageKey);
    try {
      await fs.unlink(fullPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      await fs.access(this.resolveKey(storageKey));
      return true;
    } catch {
      return false;
    }
  }
}

export function generateManifest(
  runId: string,
  artifacts: Array<{
    artifactId: string;
    type: string;
    storageKey: string;
    sha256: string;
    size: number;
    capturedAt: string;
  }>
): EvidenceManifest {
  return {
    manifestVersion: 1,
    runId,
    generatedAt: new Date().toISOString(),
    artifacts
  };
}

export function verifyManifestArtifact(
  expectedHash: string,
  actualBytes: Buffer | string
): boolean {
  const actualHash = computeSha256(actualBytes);
  return actualHash.toLowerCase() === expectedHash.toLowerCase();
}
