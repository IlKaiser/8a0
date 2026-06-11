import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@otto/shared';
import type { SocketData } from './handlers.js';
import { registerHandlers } from './handlers.js';
import { gcRooms } from './rooms.js';

const app = express();
const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');

if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('*', (_req, res) => res.sendFile(join(publicDir, 'index.html')));
} else {
  app.get('/', (_req, res) =>
    res.send('otto-a-zero server (dev): run the Vite client on :5173'));
}

const httpServer = createServer(app);
const io = new Server<
  ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData
>(httpServer);
io.on('connection', (socket) => registerHandlers(io, socket));

setInterval(() => gcRooms(), 10 * 60 * 1000).unref();

const port = Number(process.env.PORT ?? 3001);
httpServer.listen(port, () => {
  console.log(`otto-a-zero listening on :${port}`);
});
