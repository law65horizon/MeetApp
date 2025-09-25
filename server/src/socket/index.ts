import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type http from 'http';
import { redisPub, redisSub } from '../redis/client';
import { authMiddleware, type AuthenticatedSocket } from './middleware';
import { registerRoomHandlers, handleLeave } from './handlers/room';
import { registerMediaHandlers, cleanupSocketMedia } from './handlers/media';
import { registerChatHandlers, registerTimeSyncHandlers, registerModerationHandlers } from './handlers/chat';
import { logger } from '../lib/logger';
import { config } from '../config';
import { getProducers, refreshParticipantHeartbeat, unregisterProducer } from '../redis/roomRepository';

export function createSocketServer(httpServer: http.Server): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: config.CLIENT_ORIGIN,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 20000,
    pingInterval: 10000,
  });

  // Attach Redis adapter for multi-instance support
  io.adapter(createAdapter(redisPub, redisSub));

  // Auth middleware
  io.use(authMiddleware);

  io.on('connection', (socket) => {
    const authed = socket as AuthenticatedSocket;
    logger.debug({ socketId: socket.id, uid: authed.data.uid }, 'Socket connected');

    // Register all handler groups
    registerRoomHandlers(io, authed);
    registerMediaHandlers(io, authed);
    registerChatHandlers(io, authed);
    registerTimeSyncHandlers(io, authed);
    registerModerationHandlers(io, authed);

    // ─── HEARTBEAT ─────────────────────────────────────────────────────────
    socket.on('heartbeat', async () => {
      const roomId = authed.data.roomId;
      if (roomId) await refreshParticipantHeartbeat(roomId, socket.id);
    });

    // ─── DISCONNECT ────────────────────────────────────────────────────────
    socket.on('disconnecting', async () => {
      logger.debug({ socketId: socket.id, uid: authed.data.uid }, 'Socket disconnecting');

      // Clean up Redis producers
      const roomId = authed.data.roomId;
      if (roomId) {
        const roomProducers = await getProducers(roomId);
        for (const p of roomProducers) {
          if ((p as { socketId: string }).socketId === socket.id) {
            await unregisterProducer(roomId, (p as { producerId: string }).producerId);
          }
        }
        // Notify room of producer closures
        socket.to(roomId).emit('socket:disconnected', { socketId: socket.id });
      }
    });

    socket.on('disconnect', async (reason) => {
      logger.debug({ socketId: socket.id, uid: authed.data.uid, reason }, 'Socket disconnected');
      cleanupSocketMedia(socket.id);
      await handleLeave(io, authed);
    });
  });

  return io;
}