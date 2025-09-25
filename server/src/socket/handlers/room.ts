import type { Server } from 'socket.io';
import type { AuthenticatedSocket } from '../middleware';
import {
  createRoom,
  getRoom,
  deleteRoom,
  addParticipant,
  removeParticipant,
  getParticipants,
  getParticipantCount,
  updateRoom,
  addWaitingEntry,
  removeWaitingEntry,
  getWaitingList,
  getChatHistory,
  getProducers,
} from '../../redis/roomRepository';
import { workerPool } from '../../mediasoup/workerPool';
import { logger } from '../../lib/logger';
import { v4 as uuidv4 } from 'uuid';
import type { RoomMeta, RoomMode } from '../../types';
import os from 'os';

const SERVER_ID = os.hostname();

function generateRoomId(): string {
  const words = ['oak','river','pine','lake','moon','star','mist','dawn','sage','fern','iris','wave'];
  const a = words[Math.floor(Math.random() * words.length)];
  const b = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(Math.random() * 90) + 10;
  return `${a}-${b}-${n}`;
}

export function registerRoomHandlers(io: Server, socket: AuthenticatedSocket): void {
  const { uid, displayName, photoURL } = socket.data;

  // ─── CREATE ROOM ─────────────────────────────────────────────────────────
  socket.on('room:create', async (data: {
    name: string;
    mode?: RoomMode;
    isLocked?: boolean;
    password?: string;
    maxParticipants?: number;
  }, cb: (res: { error?: string; roomId?: string }) => void) => {
    try {
      const roomId = generateRoomId();
      const mode: RoomMode = data.mode ?? 'conference';

      const meta: RoomMeta = {
        roomId,
        hostId: uid,
        hostName: displayName,
        name: data.name || `${displayName}'s Room`,
        mode,
        isLocked: data.isLocked ? 'true' : 'false' as any,
        password: data.password ?? '',
        maxParticipants: data.maxParticipants ?? 50,
        createdAt: Date.now(),
        serverId: SERVER_ID,
      };

      console.log({meta})

      await createRoom(meta);
      console.log('worked')
      await workerPool.getOrCreateRouter(roomId);
      logger.info({ roomId, uid, mode }, 'Room created');
      cb({ roomId });
    } catch (err) {
      logger.error({ err }, 'room:create error');
      cb({ error: 'Failed to create room' });
    }
  });

  // ─── JOIN ROOM ────────────────────────────────────────────────────────────
  socket.on('room:join', async (data: {
    roomId: string;
    password?: string;
    displayName?: string;
  }, cb: (res: {
    id?: string;
    error?: string;
    waiting?: boolean;
    room?: RoomMeta;
    participants?: unknown[];
    chatHistory?: unknown[];
    producers?: unknown[];
    rtpCapabilities?: unknown;
  }) => void) => {
    try {
      const roomId = data.roomId.toLowerCase().trim();
      const room = await getRoom(roomId);

      if (!room) return cb({ error: 'ROOM_NOT_FOUND' });

      const count = await getParticipantCount(roomId);
      if (count >= room.maxParticipants) return cb({ error: 'ROOM_FULL' });

      // Password check
      if (room.password && data.password !== room.password) {
        return cb({ error: 'WRONG_PASSWORD' });
      }

      // Override display name if provided
      if (data.displayName) {
        socket.data.displayName = data.displayName;
      }

      const isHost = uid === room.hostId;

      // Waiting room logic
      if (room.isLocked && !isHost) {
        await addWaitingEntry(roomId, {
          socketId: socket.id,
          userId: uid,
          displayName: socket.data.displayName,
          photoURL,
          requestedAt: Date.now(),
        });

        socket.data.roomId = roomId;
        socket.join(`waiting:${roomId}`);

        // Notify host
        io.to(roomId).emit('waiting:request', {
          socketId: socket.id,
          userId: uid,
          displayName: socket.data.displayName,
          photoURL,
        });

        logger.info({ roomId, uid }, 'Added to waiting room');
        return cb({ waiting: true });
      }

      await _joinRoom(io, socket, room, isHost);

      const router = workerPool.getOrCreateRouter(roomId);
      const [participants, chatHistory, producers] = await Promise.all([
        getParticipants(roomId),
        getChatHistory(roomId),
        getProducers(roomId),
      ]);

      console.log({uid: socket.data.uid})
      cb({
        id: socket.data.uid,
        room,
        participants,
        chatHistory,
        producers,
        rtpCapabilities: (await router).rtpCapabilities,
      });
    } catch (err) {
      logger.error({ err }, 'room:join error');
      cb({ error: 'Failed to join room' });
    }
  });

  // ─── ADMIT FROM WAITING ───────────────────────────────────────────────────
  socket.on('waiting:admit', async (data: { socketId: string }, cb: (res: { error?: string }) => void) => {
    try {
      const roomId = socket.data.roomId;
      if (!roomId) return cb({ error: 'NOT_IN_ROOM' });

      const room = await getRoom(roomId);
      if (!room || room.hostId !== uid) return cb({ error: 'NOT_HOST' });

      await removeWaitingEntry(roomId, data.socketId);
      io.to(data.socketId).emit('waiting:admitted');
      cb({});
    } catch (err) {
      logger.error({ err }, 'waiting:admit error');
      cb({ error: 'Failed' });
    }
  });

  socket.on('waiting:deny', async (data: { socketId: string }, cb: (res: { error?: string }) => void) => {
    try {
      const roomId = socket.data.roomId;
      if (!roomId) return cb({ error: 'NOT_IN_ROOM' });

      const room = await getRoom(roomId);
      if (!room || room.hostId !== uid) return cb({ error: 'NOT_HOST' });

      await removeWaitingEntry(roomId, data.socketId);
      io.to(data.socketId).emit('waiting:denied');
      cb({});
    } catch (err) {
      logger.error({ err }, 'waiting:deny error');
      cb({ error: 'Failed' });
    }
  });

  // ─── LOCK / UNLOCK ROOM ───────────────────────────────────────────────────
  socket.on('room:lock', async (data: { locked: boolean }, cb: (res: { error?: string }) => void) => {
    try {
      const roomId = socket.data.roomId;
      if (!roomId) return cb({ error: 'NOT_IN_ROOM' });
      const room = await getRoom(roomId);
      if (!room || room.hostId !== uid) return cb({ error: 'NOT_HOST' });

      await updateRoom(roomId, { isLocked: data.locked });
      io.to(roomId).emit('room:locked', { locked: data.locked, by: displayName });
      cb({});
    } catch (err) {
      cb({ error: 'Failed' });
    }
  });

  // ─── LEAVE ROOM ───────────────────────────────────────────────────────────
  socket.on('room:leave', async () => {
    await handleLeave(io, socket);
  });

  // ─── END ROOM (host only) ─────────────────────────────────────────────────
  socket.on('room:end', async (cb: (res: { error?: string }) => void) => {
    try {
      const roomId = socket.data.roomId;
      if (!roomId) return cb({ error: 'NOT_IN_ROOM' });
      const room = await getRoom(roomId);
      if (!room || room.hostId !== uid) return cb({ error: 'NOT_HOST' });

      io.to(roomId).emit('room:ended', { by: displayName });
      // Disconnect all in room
      const sockets = await io.in(roomId).fetchSockets();
      for (const s of sockets) {
        s.leave(roomId);
        s.disconnect(true);
      }

      await deleteRoom(roomId);
      workerPool.closeRouter(roomId);
      logger.info({ roomId }, 'Room ended by host');
      cb({});
    } catch (err) {
      logger.error({ err }, 'room:end error');
      cb({ error: 'Failed' });
    }
  });

  // ─── HOST KICK ────────────────────────────────────────────────────────────
  socket.on('host:kick', async (data: { socketId: string }, cb: (res: { error?: string }) => void) => {
    try {
      const roomId = socket.data.roomId;
      if (!roomId) return cb({ error: 'NOT_IN_ROOM' });
      const room = await getRoom(roomId);
      if (!room || room.hostId !== uid) return cb({ error: 'NOT_HOST' });

      io.to(data.socketId).emit('room:kicked');
      const targetSocket = await io.in(data.socketId).fetchSockets();
      if (targetSocket[0]) targetSocket[0].disconnect(true);
      cb({});
    } catch (err) {
      cb({ error: 'Failed' });
    }
  });

  // ─── WAITING LIST (for host) ──────────────────────────────────────────────
  socket.on('waiting:list', async (cb: (list: unknown[]) => void) => {
    const roomId = socket.data.roomId;
    if (!roomId) return cb([]);
    const list = await getWaitingList(roomId);
    cb(list);
  });
}

async function _joinRoom(
  io: Server,
  socket: AuthenticatedSocket,
  room: RoomMeta,
  isHost: boolean,
): Promise<void> {
  const { uid, displayName, photoURL } = socket.data;
  const roomId = room.roomId;

  let role: 'host' | 'broadcaster' | 'viewer' | 'participant';
  if (isHost) {
    role = room.mode === 'broadcast' ? 'broadcaster' : 'host';
  } else {
    role = room.mode === 'broadcast' ? 'viewer' : 'participant';
  }

  const participantMeta = {
    socketId: socket.id,
    userId: uid,
    displayName,
    photoURL,
    roomId,
    isHost,
    role,
    joinedAt: Date.now(),
    lastSeen: Date.now(),
  };

  await addParticipant(participantMeta);
  socket.data.roomId = roomId;
  socket.join(roomId);

  // Notify existing participants
  socket.to(roomId).emit('participant:joined', participantMeta);
  logger.info({ roomId, uid, role }, 'Participant joined');
}

export async function handleLeave(io: Server, socket: AuthenticatedSocket): Promise<void> {
  const roomId = socket.data.roomId;
  if (!roomId) return;

  const { uid, displayName } = socket.data;

  await removeParticipant(roomId, socket.id, uid);
  socket.leave(roomId);
  socket.data.roomId = undefined;

  io.to(roomId).emit('participant:left', { socketId: socket.id, userId: uid, displayName });

  const remaining = await getParticipantCount(roomId);
  if (remaining === 0) {
    // Room is empty — let Redis TTL clean it up
    logger.info({ roomId }, 'Room empty, will expire via TTL');
    workerPool.closeRouter(roomId);
  }
}