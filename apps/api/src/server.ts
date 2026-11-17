import { config as loadEnv } from 'dotenv';
import { resolveFromRoot } from '@mirror/shared';

loadEnv({ path: resolveFromRoot('.env') });

import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { MirrorEvent } from '@mirror/contracts';
import { getPrisma, prepareDatabaseUrl } from '@mirror/db';
import { createApp } from './app';
import { createInfra } from './infra';
import { resolveSession, tokenFromCookieHeader } from './auth';

const PORT = Number(process.env.API_PORT || 4000);

interface Client {
  socket: WebSocket;
  userId: string;
}

async function main() {
  await prepareDatabaseUrl();
  const prisma = getPrisma();

  // Events are only delivered to the owner of the run. Ownership is cached per run.
  const clients = new Set<Client>();
  const runOwners = new Map<string, Promise<string | null>>();
  const ownerOf = (runId: string) => {
    if (!runOwners.has(runId)) {
      runOwners.set(
        runId,
        prisma.executionRun
          .findUnique({ where: { id: runId }, select: { experiment: { select: { investigation: { select: { userId: true } } } } } })
          .then((r) => r?.experiment.investigation.userId ?? null)
          .catch(() => null)
      );
      if (runOwners.size > 5000) runOwners.delete(runOwners.keys().next().value!);
    }
    return runOwners.get(runId)!;
  };
  const broadcast = async (event: MirrorEvent) => {
    const owner = await ownerOf(event.runId);
    if (!owner) return;
    const message = JSON.stringify(event);
    for (const client of clients) {
      if (client.userId === owner && client.socket.readyState === WebSocket.OPEN) client.socket.send(message);
    }
  };
  const infra = await createInfra((event) => void broadcast(event));

  const app = createApp({
    queue: infra.queue,
    health: async () => {
      const [db, redis] = await Promise.all([
        prisma.$queryRaw`SELECT 1`.then(() => 'ok', () => 'unavailable'),
        infra.redis.ping().then(() => 'ok', () => 'unavailable')
      ]);
      return { database: db, queue: redis };
    }
  });

  const server = http.createServer(app);
  const allowedOrigins = (process.env.CORS_ORIGINS ?? process.env.WEB_URL ?? 'http://localhost:5173').split(',').map((s) => s.trim());
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    const reject = (code: number) => {
      socket.write(`HTTP/1.1 ${code} ${code === 401 ? 'Unauthorized' : 'Forbidden'}\r\n\r\n`);
      socket.destroy();
    };
    if (!req.url?.startsWith('/ws')) return reject(403);
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.includes(origin)) return reject(403);
    void resolveSession(tokenFromCookieHeader(req.headers.cookie)).then((session) => {
      if (!session) return reject(401);
      wss.handleUpgrade(req, socket, head, (ws) => {
        const client: Client = { socket: ws, userId: session.userId };
        clients.add(client);
        ws.send(JSON.stringify({ event: 'connected', timestamp: new Date().toISOString() }));
        ws.on('close', () => clients.delete(client));
        ws.on('error', () => clients.delete(client));
      });
    }, () => reject(401));
  });

  server.listen(PORT, () => console.log(`[api] MIRROR API listening on http://localhost:${PORT}`));

  const shutdown = async () => {
    wss.close();
    server.close();
    await infra.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  console.error('[api] fatal:', err);
  process.exit(1);
});
