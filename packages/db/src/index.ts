import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

import { resolveInfraHost } from '@mirror/shared';

let client: PrismaClient | undefined;

/**
 * Resolve the database host once at startup (system DNS, then public resolvers) and pin the IP.
 * Some home routers intermittently fail to resolve managed-database hostnames. Pooled Postgres
 * services route by username, not hostname, so pinning is safe. Set DATABASE_PIN_IP=false to disable.
 */
export async function prepareDatabaseUrl(): Promise<void> {
  const raw = process.env.DATABASE_URL;
  if (!raw || process.env.DATABASE_PIN_IP === 'false') return;
  const url = new URL(raw);
  if (['localhost', '127.0.0.1'].includes(url.hostname)) return;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      url.hostname = await resolveInfraHost(url.hostname);
      process.env.DATABASE_URL = url.toString();
      return;
    } catch (err) {
      if (attempt === 3) throw err;
    }
  }
}

/** Lazily-created Prisma client shared by the API and worker processes. */
export function getPrisma(): PrismaClient {
  if (!client) {
    client = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
    });
  }
  return client;
}

/** Fixed identity used until real authentication lands. All records are owned by this user. */
export const LOCAL_OPERATOR_EMAIL = 'operator@mirror.local';

export async function ensureLocalOperator(prisma: PrismaClient = getPrisma()) {
  return prisma.user.upsert({
    where: { email: LOCAL_OPERATOR_EMAIL },
    update: {},
    create: { email: LOCAL_OPERATOR_EMAIL }
  });
}
