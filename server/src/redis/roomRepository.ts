import { redis } from './client';
import type { RoomMeta, ParticipantMeta, ChatMessage, WaitingEntry } from '../types';

const ROOM_TTL = 4 * 60 * 60;
const CHAT_MAX = 100;

const K = {
  room: (id: string) => `room:${id}`,
  participants: (id: string) => `room:${id}:participants`,
  chat: (id: string) => `room:${id}:chat`,
  waiting: (id: string) => `room:${id}:waiting`,
  producers: (id: string) => `room:${id}:producers`,
  activeRooms: () => `rooms:active`,
  userRoom: (uid: string) => `user:${uid}:room`,
};


// ─── Room ─────────────────────────────────────

export async function createRoom(meta: RoomMeta): Promise<void> {
  const tx = redis.multi();

  tx.hSet(K.room(meta.roomId), meta as unknown as Record<string, string>);
  tx.expire(K.room(meta.roomId), ROOM_TTL);
  tx.zAdd(K.activeRooms(), { score: Date.now(), value: meta.roomId });

  await tx.exec();
}

export async function getRoom(roomId: string): Promise<RoomMeta | null> {
  const data = await redis.hGetAll(K.room(roomId));

  if (!data || !data.roomId) return null;

  return {
    ...data,
    isLocked: data.isLocked === 'true',
    maxParticipants: Number(data.maxParticipants),
    createdAt: Number(data.createdAt),
  } as RoomMeta;
}

export async function updateRoom(roomId: string, fields: Partial<RoomMeta>): Promise<void> {
  await redis.hSet(K.room(roomId), fields as Record<string, string>);
  await redis.expire(K.room(roomId), ROOM_TTL);
}

export async function deleteRoom(roomId: string): Promise<void> {
  const tx = redis.multi();

  tx.del(K.room(roomId));
  tx.del(K.participants(roomId));
  tx.del(K.chat(roomId));
  tx.del(K.waiting(roomId));
  tx.del(K.producers(roomId));
  tx.zRem(K.activeRooms(), roomId);

  await tx.exec();
}

export async function roomExists(roomId: string): Promise<boolean> {
  return (await redis.exists(K.room(roomId))) === 1;
}


// ─── Participants ─────────────────────────────

export async function addParticipant(p: ParticipantMeta): Promise<void> {
  const tx = redis.multi();

  tx.hSet(K.participants(p.roomId), p.socketId, JSON.stringify(p));
  tx.expire(K.participants(p.roomId), ROOM_TTL);
  tx.set(K.userRoom(p.userId), p.roomId, { EX: ROOM_TTL });

  await tx.exec();
}

export async function removeParticipant(
  roomId: string,
  socketId: string,
  userId: string
): Promise<void> {

  const tx = redis.multi();

  tx.hDel(K.participants(roomId), socketId);
  tx.del(K.userRoom(userId));

  await tx.exec();
}

export async function getParticipants(roomId: string): Promise<ParticipantMeta[]> {
  const data = await redis.hGetAll(K.participants(roomId));

  if (!data) return [];

  return Object.values(data).map(v => JSON.parse(v) as ParticipantMeta);
}

export async function getParticipant(roomId: string, socketId: string): Promise<ParticipantMeta | null> {
  const data = await redis.hGet(K.participants(roomId), socketId);

  return data ? JSON.parse(data) as ParticipantMeta : null;
}

export async function updateParticipant(p: ParticipantMeta): Promise<void> {
  await redis.hSet(K.participants(p.roomId), p.socketId, JSON.stringify(p));
}

export async function getParticipantCount(roomId: string): Promise<number> {
  return redis.hLen(K.participants(roomId));
}

export async function refreshParticipantHeartbeat(roomId: string, socketId: string): Promise<void> {
  const raw = await redis.hGet(K.participants(roomId), socketId);

  if (!raw) return;

  const p = JSON.parse(raw) as ParticipantMeta;
  p.lastSeen = Date.now();

  await redis.hSet(K.participants(roomId), socketId, JSON.stringify(p));
}


// ─── Chat ─────────────────────────────────────

export async function appendChatMessage(msg: ChatMessage): Promise<void> {

  const key = K.chat(msg.roomId);

  const tx = redis.multi();

  tx.rPush(key, JSON.stringify(msg));
  tx.lTrim(key, -CHAT_MAX, -1);
  tx.expire(key, ROOM_TTL);

  await tx.exec();
}

export async function getChatHistory(roomId: string): Promise<ChatMessage[]> {

  const messages = await redis.lRange(K.chat(roomId), 0, -1);

  return messages.map(m => JSON.parse(m) as ChatMessage);
}


// ─── Waiting Room ─────────────────────────────

export async function addWaitingEntry(roomId: string, entry: WaitingEntry): Promise<void> {
  await redis.hSet(K.waiting(roomId), entry.socketId, JSON.stringify(entry));
  await redis.expire(K.waiting(roomId), ROOM_TTL);
}

export async function removeWaitingEntry(roomId: string, socketId: string): Promise<void> {
  await redis.hDel(K.waiting(roomId), socketId);
}

export async function getWaitingList(roomId: string): Promise<WaitingEntry[]> {

  const data = await redis.hGetAll(K.waiting(roomId));

  if (!data) return [];

  return Object.values(data).map(v => JSON.parse(v) as WaitingEntry);
}


// ─── Producers ───────────────────────────────

export async function registerProducer(roomId: string, producerId: string, info: object): Promise<void> {

  await redis.hSet(K.producers(roomId), producerId, JSON.stringify(info));

  await redis.expire(K.producers(roomId), ROOM_TTL);
}

export async function unregisterProducer(roomId: string, producerId: string): Promise<void> {

  await redis.hDel(K.producers(roomId), producerId);
}

export async function getProducers(roomId: string): Promise<Record<string, unknown>[]> {

  const data = await redis.hGetAll(K.producers(roomId));

  if (!data) return [];

  return Object.values(data).map(v => JSON.parse(v));
}


// ─── Active Rooms ─────────────────────────────

export async function getActiveRoomCount(): Promise<number> {
  return redis.zCard(K.activeRooms());
}

// //roomRepository
// import { redis } from './client';
// import type { RoomMeta, ParticipantMeta, ChatMessage, WaitingEntry } from '../types';

// const ROOM_TTL = 4 * 60 * 60; // 4 hours in seconds
// const CHAT_MAX = 100;

// // ─── Key builders ────────────────────────────────────────────────────────────
// const K = {
//   room: (id: string) => `room:${id}`,
//   participants: (id: string) => `room:${id}:participants`,
//   chat: (id: string) => `room:${id}:chat`,
//   waiting: (id: string) => `room:${id}:waiting`,
//   producers: (id: string) => `room:${id}:producers`,
//   activeRooms: () => `rooms:active`,
//   userRoom: (uid: string) => `user:${uid}:room`,
// };

// // ─── Room ─────────────────────────────────────────────────────────────────────
// export async function createRoom(meta: RoomMeta): Promise<void> {
//   const pipeline = redis.pipeline();
//   pipeline.hmset(K.room(meta.roomId), meta as unknown as Record<string, string>);
//   pipeline.expire(K.room(meta.roomId), ROOM_TTL);
//   pipeline.zadd(K.activeRooms(), Date.now(), meta.roomId);
//   await pipeline.exec();
// }

// export async function getRoom(roomId: string): Promise<RoomMeta | null> {
//   const data = await redis.hgetall(K.room(roomId));
//   if (!data || !data.roomId) return null;
//   return {
//     ...data,
//     isLocked: data.isLocked === 'true',
//     maxParticipants: Number(data.maxParticipants),
//     createdAt: Number(data.createdAt),
//   } as RoomMeta;
// }

// export async function updateRoom(roomId: string, fields: Partial<RoomMeta>): Promise<void> {
//   await redis.hmset(K.room(roomId), fields as Record<string, string>);
//   await redis.expire(K.room(roomId), ROOM_TTL);
// }

// export async function deleteRoom(roomId: string): Promise<void> {
//   const pipeline = redis.pipeline();
//   pipeline.del(K.room(roomId));
//   pipeline.del(K.participants(roomId));
//   pipeline.del(K.chat(roomId));
//   pipeline.del(K.waiting(roomId));
//   pipeline.del(K.producers(roomId));
//   pipeline.zrem(K.activeRooms(), roomId);
//   await pipeline.exec();
// }

// export async function roomExists(roomId: string): Promise<boolean> {
//   return (await redis.exists(K.room(roomId))) === 1;
// }

// // ─── Participants ─────────────────────────────────────────────────────────────
// export async function addParticipant(p: ParticipantMeta): Promise<void> {
//   const pipeline = redis.pipeline();
//   pipeline.hset(K.participants(p.roomId), p.socketId, JSON.stringify(p));
//   pipeline.expire(K.participants(p.roomId), ROOM_TTL);
//   pipeline.set(K.userRoom(p.userId), p.roomId, 'EX', ROOM_TTL);
//   await pipeline.exec();
// }

// export async function removeParticipant(roomId: string, socketId: string, userId: string): Promise<void> {
//   const pipeline = redis.pipeline();
//   pipeline.hdel(K.participants(roomId), socketId);
//   pipeline.del(K.userRoom(userId));
//   await pipeline.exec();
// }

// export async function getParticipants(roomId: string): Promise<ParticipantMeta[]> {
//   const data = await redis.hgetall(K.participants(roomId));
//   if (!data) return [];
//   return Object.values(data).map((v) => JSON.parse(v) as ParticipantMeta);
// }

// export async function getParticipant(roomId: string, socketId: string): Promise<ParticipantMeta | null> {
//   const data = await redis.hget(K.participants(roomId), socketId);
//   return data ? (JSON.parse(data) as ParticipantMeta) : null;
// }

// export async function updateParticipant(p: ParticipantMeta): Promise<void> {
//   await redis.hset(K.participants(p.roomId), p.socketId, JSON.stringify(p));
// }

// export async function getParticipantCount(roomId: string): Promise<number> {
//   return redis.hlen(K.participants(roomId));
// }

// export async function refreshParticipantHeartbeat(roomId: string, socketId: string): Promise<void> {
//   const raw = await redis.hget(K.participants(roomId), socketId);
//   if (!raw) return;
//   const p = JSON.parse(raw) as ParticipantMeta;
//   p.lastSeen = Date.now();
//   await redis.hset(K.participants(roomId), socketId, JSON.stringify(p));
// }

// // ─── Chat ─────────────────────────────────────────────────────────────────────
// export async function appendChatMessage(msg: ChatMessage): Promise<void> {
//   const key = K.chat(msg.roomId);
//   const pipeline = redis.pipeline();
//   pipeline.rpush(key, JSON.stringify(msg));
//   pipeline.ltrim(key, -CHAT_MAX, -1);
//   pipeline.expire(key, ROOM_TTL);
//   await pipeline.exec();
// }

// export async function getChatHistory(roomId: string): Promise<ChatMessage[]> {
//   const messages = await redis.lrange(K.chat(roomId), 0, -1);
//   return messages.map((m) => JSON.parse(m) as ChatMessage);
// }

// // ─── Waiting room ─────────────────────────────────────────────────────────────
// export async function addToWaiting(entry: WaitingEntry): Promise<void> {
//   await redis.hset(K.waiting(entry.socketId.split(':')[0] || entry.socketId), entry.socketId, JSON.stringify(entry));
//   await redis.hset(K.waiting(entry.socketId), 'roomId', entry.socketId);
//   // Use a dedicated waiting key per room
//   await redis.hset(`room:${entry.requestedAt}:waiting`, entry.socketId, JSON.stringify(entry));
// }

// export async function addWaitingEntry(roomId: string, entry: WaitingEntry): Promise<void> {
//   await redis.hset(K.waiting(roomId), entry.socketId, JSON.stringify(entry));
//   await redis.expire(K.waiting(roomId), ROOM_TTL);
// }

// export async function removeWaitingEntry(roomId: string, socketId: string): Promise<void> {
//   await redis.hdel(K.waiting(roomId), socketId);
// }

// export async function getWaitingList(roomId: string): Promise<WaitingEntry[]> {
//   const data = await redis.hgetall(K.waiting(roomId));
//   if (!data) return [];
//   return Object.values(data).map((v) => JSON.parse(v) as WaitingEntry);
// }

// // ─── Producers registry ───────────────────────────────────────────────────────
// export async function registerProducer(roomId: string, producerId: string, info: object): Promise<void> {
//   await redis.hset(K.producers(roomId), producerId, JSON.stringify(info));
//   await redis.expire(K.producers(roomId), ROOM_TTL);
// }

// export async function unregisterProducer(roomId: string, producerId: string): Promise<void> {
//   await redis.hdel(K.producers(roomId), producerId);
// }

// export async function getProducers(roomId: string): Promise<Record<string, unknown>[]> {
//   const data = await redis.hgetall(K.producers(roomId));
//   if (!data) return [];
//   return Object.values(data).map((v) => JSON.parse(v));
// }

// // ─── Active rooms list ────────────────────────────────────────────────────────
// export async function getActiveRoomCount(): Promise<number> {
//   return redis.zcard(K.activeRooms());
// }