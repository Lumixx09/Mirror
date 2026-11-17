import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { LOCAL_OPERATOR_EMAIL, getPrisma, prepareDatabaseUrl } from './index';

const scrypt = promisify(crypto.scrypt) as (p: string, s: Buffer, k: number, o: crypto.ScryptOptions) => Promise<Buffer>;

// Same format as apps/api/src/auth.ts hashPassword.
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

/**
 * Creates (or updates the password of) the account named by SEED_USER_EMAIL / SEED_USER_PASSWORD,
 * then transfers investigations created before authentication existed (owned by the password-less
 * local operator) to that account.
 */
async function main() {
  await prepareDatabaseUrl();
  const prisma = getPrisma();
  const email = process.env.SEED_USER_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_USER_PASSWORD;
  if (!email || !password) {
    console.log('SEED_USER_EMAIL / SEED_USER_PASSWORD not set; nothing to seed.');
    return;
  }
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, name: process.env.SEED_USER_NAME ?? 'MIRROR Investigator', passwordHash }
  });
  console.log(`Seeded account ${email}`);

  const operator = await prisma.user.findUnique({ where: { email: LOCAL_OPERATOR_EMAIL } });
  if (operator && operator.id !== user.id) {
    const moved = await prisma.investigation.updateMany({ where: { userId: operator.id }, data: { userId: user.id } });
    await prisma.auditEvent.updateMany({ where: { userId: operator.id }, data: { userId: user.id } });
    if (moved.count) console.log(`Transferred ${moved.count} pre-authentication investigation(s) to ${email}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => getPrisma().$disconnect());
