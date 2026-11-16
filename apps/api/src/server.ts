import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { CreateInvestigationSchema, TargetUrlSchema } from '@mirror/schemas';
import { isPrivateOrBlockedIp } from '@mirror/shared';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.API_PORT || 4000;

app.use(cors());
app.use(express.json());

// In-memory store for fallback development when DB is connecting
const inMemoryStore = {
  investigations: new Map<string, any>(),
  experiments: new Map<string, any>(),
  runs: new Map<string, any>(),
  findings: new Map<string, any>()
};

// WebSocket connection handling & event broadcasting
const clients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));
  ws.on('close', () => clients.delete(ws));
});

export function broadcastEvent(eventType: string, payload: unknown) {
  const message = JSON.stringify({ event: eventType, payload, timestamp: new Date().toISOString() });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'api',
    timestamp: new Date().toISOString()
  });
});

// Create investigation
app.post('/api/v1/investigations', (req, res) => {
  try {
    const validated = CreateInvestigationSchema.parse(req.body);

    // SSRF & authorization scope check
    const url = new URL(validated.targetUrl);
    if (isPrivateOrBlockedIp(url.hostname) && !process.env.ALLOWED_TEST_DOMAINS?.includes(url.hostname)) {
      return res.status(403).json({
        error: 'Target URL resolves to a prohibited internal IP or cloud metadata service.'
      });
    }

    const id = crypto.randomUUID();
    const investigation = {
      id,
      ...validated,
      status: 'ready',
      createdAt: new Date().toISOString()
    };

    inMemoryStore.investigations.set(id, investigation);
    broadcastEvent('investigation:created', { id, title: investigation.title });

    return res.status(201).json(investigation);
  } catch (err: any) {
    return res.status(400).json({ error: err.message, details: err.errors });
  }
});

// List investigations
app.get('/api/v1/investigations', (_req, res) => {
  const items = Array.from(inMemoryStore.investigations.values());
  res.json({ data: items, total: items.length });
});

// Get investigation by ID
app.get('/api/v1/investigations/:id', (req, res) => {
  const investigation = inMemoryStore.investigations.get(req.params.id);
  if (!investigation) {
    return res.status(404).json({ error: 'Investigation not found' });
  }
  return res.json(investigation);
});

// Start experiment run
app.post('/api/v1/experiments/:id/run', (req, res) => {
  const runId = crypto.randomUUID();
  const run = {
    id: runId,
    experimentId: req.params.id,
    status: 'queued',
    startedAt: new Date().toISOString()
  };

  inMemoryStore.runs.set(runId, run);
  broadcastEvent('experiment:queued', { runId, experimentId: req.params.id });

  return res.status(202).json(run);
});

// Get run status
app.get('/api/v1/runs/:id', (req, res) => {
  const run = inMemoryStore.runs.get(req.params.id);
  if (!run) {
    return res.status(404).json({ error: 'Run not found' });
  }
  return res.json(run);
});

server.listen(PORT, () => {
  console.log(`MIRROR API server running on port ${PORT}`);
});
