import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';

/** Repository root, resolved from this package's location (src/ or dist/ are both two levels below). */
export const REPO_ROOT = path.resolve(__dirname, '../../..');

/** Resolve a possibly-relative path against the repository root rather than the process cwd. */
export function resolveFromRoot(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(REPO_ROOT, p);
}

export function computeSha256(buffer: Buffer | string): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Deterministic UUID-shaped identifier derived from the given parts.
 * Used for idempotent records (e.g. findings) so retries never create duplicates.
 */
export function deterministicId(...parts: Array<string | number>): string {
  const hex = computeSha256(parts.join('␟'));
  // Shape as RFC 4122 version 5 style UUID
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Stable JSON serialisation (sorted keys) for fingerprinting configuration. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export function fingerprint(value: unknown): string {
  return computeSha256(stableStringify(value));
}

const SECRET_KEY_PATTERN = /password|passwd|secret|authorization|cookie|token|api[-_]?key|session[-_]?id|card|cvv|cvc/i;

export function redactSecrets(data: unknown): unknown {
  if (typeof data === 'string') {
    return data
      .replace(/bearer\s+[a-zA-Z0-9_\-.~+/=]+/gi, 'Bearer [REDACTED]')
      .replace(/(password|passwd|token|api[-_]?key|secret)\s*[:=]\s*["']?[^"'\s&]+["']?/gi, '$1=[REDACTED]');
  }
  if (Array.isArray(data)) return data.map(redactSecrets);
  if (data !== null && typeof data === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      copy[key] = SECRET_KEY_PATTERN.test(key) ? '[REDACTED]' : redactSecrets(value);
    }
    return copy;
  }
  return data;
}

/** Redact sensitive query parameter values in a URL while keeping parameter names. */
export function redactUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    for (const key of Array.from(url.searchParams.keys())) {
      if (SECRET_KEY_PATTERN.test(key)) url.searchParams.set(key, '[REDACTED]');
    }
    url.username = url.username ? '[REDACTED]' : '';
    url.password = url.password ? '[REDACTED]' : '';
    return url.toString();
  } catch {
    return rawUrl;
  }
}

// ---------------------------------------------------------------------------
// Money parsing
// ---------------------------------------------------------------------------

const SYMBOL_CURRENCY: Record<string, string> = {
  $: 'USD',
  US$: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  '₦': 'NGN',
  '₹': 'INR'
};

const ISO_CODES = ['USD', 'EUR', 'GBP', 'JPY', 'NGN', 'INR', 'CAD', 'AUD', 'CHF'];

export const MONEY_PATTERN = new RegExp(
  String.raw`(US\$|[$€£¥₦₹]|\b(?:${ISO_CODES.join('|')})\b)\s?(\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)` +
    String.raw`|(\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s?([€£]|\b(?:${ISO_CODES.join('|')})\b)`,
  'g'
);

export interface ParsedMoney {
  amount: number | null;
  currency: string | null;
  /** The matched money substring, or null when nothing matched. */
  matched: string | null;
  /** True when the amount is expressed per period (e.g. "/mo", "per month"). */
  recurring: boolean;
}

/**
 * Parse a numeric amount. Decimal separator handling is explicit:
 * the last "," or "." followed by 1-2 digits is treated as the decimal separator.
 */
export function parseAmount(numeric: string): number | null {
  const compact = numeric.replace(/\s/g, '');
  const decimalMatch = compact.match(/[.,](\d{1,2})$/);
  let integerPart = compact;
  let fraction = '';
  if (decimalMatch) {
    integerPart = compact.slice(0, compact.length - decimalMatch[0].length);
    fraction = decimalMatch[1];
  }
  integerPart = integerPart.replace(/[.,]/g, '');
  if (!/^\d+$/.test(integerPart)) return null;
  const value = Number(fraction ? `${integerPart}.${fraction}` : integerPart);
  return Number.isFinite(value) ? value : null;
}

const RECURRING_PATTERN = /(\/\s?(mo|month|yr|year|wk|week)\b|per\s+(month|year|week)|monthly|annually|yearly|auto-?renew)/i;

/** Parse the first money expression in a text. Missing values are null, never zero. */
export function parseMoney(text: string): ParsedMoney {
  MONEY_PATTERN.lastIndex = 0;
  const match = MONEY_PATTERN.exec(text);
  const recurring = RECURRING_PATTERN.test(text);
  if (!match) return { amount: null, currency: null, matched: null, recurring };
  const symbol = match[1] ?? match[4];
  const numeric = match[2] ?? match[3];
  const currency = SYMBOL_CURRENCY[symbol] ?? (ISO_CODES.includes(symbol) ? symbol : null);
  return { amount: parseAmount(numeric), currency, matched: match[0], recurring };
}

// ---------------------------------------------------------------------------
// Target authorization & SSRF protection
// ---------------------------------------------------------------------------

export function parseAllowList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function inCidr(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
];

/** True if the address (or hostname literal) is loopback, private, link-local, metadata or otherwise non-public. */
export function isPrivateOrBlockedIp(address: string): boolean {
  const host = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === 'metadata.google.internal') return true;

  if (net.isIPv4(host)) return BLOCKED_V4.some(([base, bits]) => inCidr(host, base, bits));

  if (net.isIPv6(host)) {
    const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateOrBlockedIp(mapped[1]);
    if (host === '::' || host === '::1') return true;
    if (/^f[cd][0-9a-f]{2}:/.test(host)) return true; // fc00::/7 unique local
    if (/^fe[89ab][0-9a-f]:/.test(host)) return true; // fe80::/10 link-local
    if (host.startsWith('fd00:ec2::254')) return true; // AWS IPv6 metadata
    return false;
  }
  return false;
}

export function hostMatchesDomain(hostname: string, domain: string): boolean {
  const h = hostname.toLowerCase();
  const d = domain.toLowerCase().replace(/^\*\./, '');
  return h === d || h.endsWith(`.${d}`);
}

export class TargetBlockedError extends Error {
  readonly code = 'TARGET_BLOCKED';
  constructor(message: string) {
    super(message);
    this.name = 'TargetBlockedError';
  }
}

export interface TargetPolicy {
  /** Domain the investigator is authorized to test (subdomains included). */
  permittedDomain?: string;
  /** Hosts explicitly allowed even if they resolve to private addresses (local development only). */
  allowedTestHosts?: string[];
  /** Injected resolver for tests. */
  resolve?: (hostname: string) => Promise<string[]>;
}

async function defaultResolve(hostname: string): Promise<string[]> {
  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  return results.map((r) => r.address);
}

/**
 * Validate a URL before queueing or navigating:
 * scheme allowlist, authorized scope, and DNS resolution against private ranges.
 * Must be re-run by the worker for every navigation and redirect.
 */
export async function assertTargetAllowed(rawUrl: string, policy: TargetPolicy = {}): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new TargetBlockedError('Target is not a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TargetBlockedError(`Scheme ${url.protocol} is not permitted. Only http and https are supported.`);
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (policy.permittedDomain && !hostMatchesDomain(hostname, policy.permittedDomain)) {
    throw new TargetBlockedError(`Host ${hostname} is outside the authorized scope (${policy.permittedDomain}).`);
  }

  const allowed = (policy.allowedTestHosts ?? []).includes(hostname);
  if (allowed) return url;

  if (isPrivateOrBlockedIp(hostname)) {
    throw new TargetBlockedError(`Host ${hostname} is a protected internal destination.`);
  }

  if (!net.isIP(hostname)) {
    let addresses: string[];
    try {
      addresses = await (policy.resolve ?? defaultResolve)(hostname);
    } catch {
      throw new TargetBlockedError(`Host ${hostname} could not be resolved.`);
    }
    const blocked = addresses.find((a) => isPrivateOrBlockedIp(a));
    if (blocked) {
      throw new TargetBlockedError(`Host ${hostname} resolves to a protected internal address.`);
    }
  }
  return url;
}

export function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Infrastructure connectivity
// ---------------------------------------------------------------------------

const PUBLIC_RESOLVERS = ['1.1.1.1', '8.8.8.8'];

/**
 * Resolve a hostname with the system resolver, falling back to public DNS resolvers.
 * Some home routers fail to resolve multi-level CNAME chains used by managed services.
 * Only used for infrastructure endpoints configured by the operator, never for targets.
 */
export async function resolveInfraHost(hostname: string): Promise<string> {
  if (net.isIP(hostname)) return hostname;
  try {
    const { address } = await dns.lookup(hostname, { family: 4 });
    return address;
  } catch {
    const resolver = new dns.Resolver({ timeout: 5000, tries: 2 });
    resolver.setServers(PUBLIC_RESOLVERS);
    const [address] = await resolver.resolve4(hostname);
    if (!address) throw new Error(`Unable to resolve infrastructure host ${hostname}`);
    return address;
  }
}

export interface RedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: { servername: string };
  maxRetriesPerRequest: null;
  enableReadyCheck: boolean;
}

/**
 * Build ioredis connection options from a redis:// or rediss:// URL.
 * The host is pre-resolved (with public DNS fallback) while TLS still verifies the original hostname.
 */
export async function redisOptionsFromUrl(rawUrl: string): Promise<RedisConnectionOptions> {
  const url = new URL(rawUrl);
  const hostname = url.hostname;
  const tls = url.protocol === 'rediss:';
  return {
    host: await resolveInfraHost(hostname),
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined,
    tls: tls ? { servername: hostname } : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  };
}
