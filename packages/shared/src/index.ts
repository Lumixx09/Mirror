import crypto from 'node:crypto';

export function computeSha256(buffer: Buffer | string): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function redactSecrets(data: unknown): unknown {
  if (typeof data === 'string') {
    return data
      .replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED]')
      .replace(/password\s*[:=]\s*["']?[^"'\s&]+["']?/gi, 'password=[REDACTED]')
      .replace(/token\s*[:=]\s*["']?[^"'\s&]+["']?/gi, 'token=[REDACTED]');
  }
  if (Array.isArray(data)) {
    return data.map(redactSecrets);
  }
  if (data !== null && typeof data === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('authorization') ||
        lowerKey.includes('cookie') ||
        lowerKey.includes('token')
      ) {
        copy[key] = '[REDACTED]';
      } else {
        copy[key] = redactSecrets(value);
      }
    }
    return copy;
  }
  return data;
}

export function isPrivateOrBlockedIp(ip: string): boolean {
  if (ip === 'localhost' || ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0') {
    return true;
  }
  // 10.0.0.0/8
  if (/^10\./.test(ip)) return true;
  // 172.16.0.0/12
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
  // 192.168.0.0/16
  if (/^192\.168\./.test(ip)) return true;
  // Cloud metadata endpoint (169.254.169.254) / Link-local
  if (/^169\.254\./.test(ip)) return true;
  return false;
}
