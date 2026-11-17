import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import fc from 'fast-check';
import {
  generateManifest,
  InvalidStorageKeyError,
  LocalStorageDriver,
  verifyManifest,
  verifyManifestArtifact
} from '../src/index';

async function tempDriver() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mirror-evidence-'));
  return new LocalStorageDriver(dir);
}

describe('LocalStorageDriver', () => {
  it.each(['../secret', 'runs/../../x', '/abs/path', 'C:\\Windows\\x', 'runs//a', './a'])('rejects key %s', async (key) => {
    const driver = await tempDriver();
    expect(() => driver.resolveKey(key)).toThrow(InvalidStorageKeyError);
  });

  it('stores, hashes and refuses to overwrite evidence with different bytes', async () => {
    const driver = await tempDriver();
    const stored = await driver.put('runs/r1/a.txt', 'hello');
    expect(stored.size).toBe(5);
    await expect(driver.put('runs/r1/a.txt', 'hello')).resolves.toEqual(stored);
    await expect(driver.put('runs/r1/a.txt', 'tampered')).rejects.toThrow(/immutable/);
  });

  it('detects tampering through manifest verification', async () => {
    const driver = await tempDriver();
    const a = await driver.put('runs/r1/a.txt', 'alpha');
    const manifest = generateManifest(
      'r1',
      [{ artifactId: 'a', type: 'dom_html', storageKey: 'runs/r1/a.txt', ...a, capturedAt: 'now' }],
      'now'
    );
    expect(await verifyManifest(manifest, driver)).toEqual({ verified: 1, failed: [] });
    await fs.writeFile(driver.resolveKey('runs/r1/a.txt'), 'alphA');
    expect((await verifyManifest(manifest, driver)).failed[0].reason).toBe('hash mismatch');
  });
});

describe('verifyManifestArtifact', () => {
  it('any single-byte alteration invalidates the hash', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 1, maxLength: 256 }),
        fc.nat(),
        fc.integer({ min: 1, max: 255 }),
        (bytes, pos, flip) => {
          const original = Buffer.from(bytes);
          const hash = crypto.createHash('sha256').update(original).digest('hex');
          const altered = Buffer.from(original);
          altered[pos % altered.length] ^= flip;
          expect(verifyManifestArtifact(hash, original)).toBe(true);
          expect(verifyManifestArtifact(hash, altered)).toBe(false);
        }
      )
    );
  });
});
