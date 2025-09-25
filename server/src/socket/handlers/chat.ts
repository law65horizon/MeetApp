import type { Server } from 'socket.io';
import type { AuthenticatedSocket } from '../middleware';
// import { appendChatMessage, getRoom } from ;
import { logger } from '../../lib/logger';
import { v4 as uuidv4 } from 'uuid';
import { appendChatMessage, getRoom } from '../../redis/roomRepository';

export function registerChatHandlers(io: Server, socket: AuthenticatedSocket): void {
  const { uid, displayName, photoURL } = socket.data;

  // ─── SEND MESSAGE ─────────────────────────────────────────────────────────
  socket.on('chat:send', async (
    data: { text: string },
    cb: (res: { error?: string; messageId?: string }) => void,
  ) => {
    try {
      const roomId = socket.data.roomId;
      if (!roomId) return cb({ error: 'NOT_IN_ROOM' });
      if (!data.text?.trim()) return cb({ error: 'EMPTY_MESSAGE' });

      const msg = {
        id: uuidv4(),
        roomId,
        senderId: uid,
        senderName: displayName,
        senderPhoto: photoURL,
        text: data.text.trim().slice(0, 2000),
        timestamp: Date.now(),
      };

      await appendChatMessage(msg);
      io.to(roomId).emit('chat:message', msg);
      cb({ messageId: msg.id });
    } catch (err) {
      logger.error({ err }, 'chat:send error');
      cb({ error: 'Failed to send message' });
    }
  });

  // ─── TYPING INDICATOR ─────────────────────────────────────────────────────
  socket.on('chat:typing', (data: { isTyping: boolean }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.to(roomId).emit('chat:typing', {
      socketId: socket.id,
      userId: uid,
      displayName,
      isTyping: data.isTyping,
    });
  });

  // ─── EMOJI REACTIONS ──────────────────────────────────────────────────────
  socket.on('reaction:send', (data: { emoji: string }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const allowed = ['👍', '❤️', '😂', '😮', '👏', '🎉', '🔥', '💯'];
    if (!allowed.includes(data.emoji)) return;
    io.to(roomId).emit('reaction:received', {
      socketId: socket.id,
      userId: uid,
      displayName,
      emoji: data.emoji,
      timestamp: Date.now(),
    });
  });
}

export function registerTimeSyncHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * NTP-style clock synchronisation.
   *
   * Client sends { t0: clientNow }.
   * Server stamps t1 (receive) and t2 (send) then echoes back.
   * Client computes:
   *   RTT   = (t3 - t0) - (t2 - t1)
   *   offset = ((t1 - t0) + (t2 - t3)) / 2
   *
   * Client repeats several times, discards outliers, averages.
   * The offset is added to Date.now() to get server-aligned time.
   */
  socket.on('time:sync', (data: { t0: number }, cb: (res: { t1: number; t2: number; serverNow: number }) => void) => {
    const t1 = Date.now();
    // Minimal processing to keep t2 ≈ t1
    const t2 = Date.now();
    cb({ t1, t2, serverNow: t2 });
  });

  /**
   * Broadcast the authoritative server timestamp to the whole room
   * every 30 s so all clients can resync passively.
   */
  socket.on('time:broadcast-request', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    io.to(roomId).emit('time:server-tick', { serverNow: Date.now() });
  });
}

export function registerModerationHandlers(io: Server, socket: AuthenticatedSocket): void {
  const { uid } = socket.data;

  socket.on('host:mute-all', async () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    // Import here to avoid circular
    const room = await getRoom(roomId);
    if (!room || room.hostId !== uid) return;
    socket.to(roomId).emit('host:mute-all');
  });

  socket.on('host:disable-all-cameras', async () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = await getRoom(roomId);
    if (!room || room.hostId !== uid) return;
    socket.to(roomId).emit('host:disable-all-cameras');
  });

  socket.on('host:mute-participant', async (data: { socketId: string }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = await getRoom(roomId);
    if (!room || room.hostId !== uid) return;
    io.to(data.socketId).emit('host:mute-you');
  });
}