import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  assertTargetAllowed,
  deterministicId,
  isPrivateOrBlockedIp,
  parseMoney,
  redactSecrets,
  redactUrl,
  stableStringify,
  TargetBlockedError
} from '../src/index';

describe('parseMoney', () => {
  it.each([
    ['$49.00', 49, 'USD', false],
    ['Total: $1,234.50', 1234.5, 'USD', false],
    ['€12,50', 12.5, 'EUR', false],
    ['12,50 €', 12.5, 'EUR', false],
    ['GBP 8', 8, 'GBP', false],
    ['$19.99/mo', 19.99, 'USD', true],
    ['Auto-renews monthly $5', 5, 'USD', true]
  ])('parses %s', (text, amount, currency, recurring) => {
    const parsed = parseMoney(text);
    expect(parsed.amount).toBe(amount);
    expect(parsed.currency).toBe(currency);
    expect(parsed.recurring).toBe(recurring);
  });

  it('returns null (not zero) when no amount is present', () => {
    expect(parseMoney('Free shipping available')).toEqual({ amount: null, currency: null, matched: null, recurring: false });
  });

  it('round-trips any 2-decimal USD amount', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 99_999_999 }), (cents) => {
        const amount = cents / 100;
        const text = `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        expect(parseMoney(text).amount).toBeCloseTo(amount, 2);
      })
    );
  });
});

describe('isPrivateOrBlockedIp', () => {
  it.each([
    '127.0.0.1',
    '127.8.8.8',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::ffff:127.0.0.1',
    'fd12::1',
    'fe80::1',
    'localhost',
    'metadata.google.internal'
  ])('blocks %s', (ip) => expect(isPrivateOrBlockedIp(ip)).toBe(true));

  it.each(['8.8.8.8', '172.32.0.1', '1.1.1.1', '2606:4700::1111', 'example.com'])('allows %s', (ip) =>
    expect(isPrivateOrBlockedIp(ip)).toBe(false)
  );
});

describe('assertTargetAllowed', () => {
  const publicResolver = async () => ['93.184.216.34'];

  it('rejects non-http schemes', async () => {
    await expect(assertTargetAllowed('file:///c:/windows/win.ini')).rejects.toBeInstanceOf(TargetBlockedError);
    await expect(assertTargetAllowed('javascript:alert(1)')).rejects.toBeInstanceOf(TargetBlockedError);
  });

  it('rejects hosts outside the permitted domain, including suffix tricks', async () => {
    await expect(
      assertTargetAllowed('https://evil.test/x', { permittedDomain: 'shop.test', resolve: publicResolver })
    ).rejects.toThrow(/outside the authorized scope/);
    await expect(
      assertTargetAllowed('https://notshop.test/x', { permittedDomain: 'shop.test', resolve: publicResolver })
    ).rejects.toThrow(/outside the authorized scope/);
  });

  it('accepts subdomains of the permitted domain', async () => {
    await expect(
      assertTargetAllowed('https://www.shop.test/x', { permittedDomain: 'shop.test', resolve: publicResolver })
    ).resolves.toBeInstanceOf(URL);
  });

  it('blocks DNS names that resolve to private addresses (rebinding defence)', async () => {
    await expect(
      assertTargetAllowed('https://rebind.test/', { resolve: async () => ['93.184.216.34', '10.0.0.5'] })
    ).rejects.toThrow(/protected internal address/);
  });

  it('blocks loopback unless explicitly allowed as a test host', async () => {
    await expect(assertTargetAllowed('http://localhost:4001/product')).rejects.toBeInstanceOf(TargetBlockedError);
    await expect(
      assertTargetAllowed('http://localhost:4001/product', { allowedTestHosts: ['localhost'] })
    ).resolves.toBeInstanceOf(URL);
  });

  it('does not treat allow-list entries as substrings', async () => {
    await expect(assertTargetAllowed('http://127.0.0.2/', { allowedTestHosts: ['127.0.0.1'] })).rejects.toBeInstanceOf(
      TargetBlockedError
    );
  });
});

describe('ids and redaction', () => {
  it('deterministicId is stable and UUID-shaped', () => {
    const a = deterministicId('run', 'a', 'b', 1);
    expect(a).toBe(deterministicId('run', 'a', 'b', 1));
    expect(a).not.toBe(deterministicId('run', 'a', 'b', 2));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('stableStringify ignores key order', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.integer()), (obj) => {
        const reversed = Object.fromEntries(Object.entries(obj).reverse());
        expect(stableStringify(reversed)).toBe(stableStringify(obj));
      })
    );
  });

  it('redacts secret keys, bearer tokens and sensitive query values', () => {
    expect(redactSecrets({ Authorization: 'Bearer abc', nested: { apiKey: 'x', ok: 'Bearer abc.def' } })).toEqual({
      Authorization: '[REDACTED]',
      nested: { apiKey: '[REDACTED]', ok: 'Bearer [REDACTED]' }
    });
    expect(redactUrl('https://x.test/p?token=123&variant=B')).toBe('https://x.test/p?token=%5BREDACTED%5D&variant=B');
  });
});
