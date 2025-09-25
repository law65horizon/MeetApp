import type { Server } from 'socket.io';
import type { AuthenticatedSocket } from '../middleware';
import type { WebRtcTransport, Producer, Consumer } from 'mediasoup/node/lib/types';
import { workerPool } from '../../mediasoup/workerPool';
import { getIceServers, webRtcTransportOptions } from '../../config/mediasoup';
import { getRoom, getParticipant, registerProducer, unregisterProducer, getParticipants } from '../../redis/roomRepository';
import { logger } from '../../lib/logger';
import { v4 as uuidv4 } from 'uuid';

// In-memory transport/producer/consumer store per socket
// (These are process-local; in multi-server you'd proxy, but for single-process this is fine)
const socketTransports = new Map<string, Map<string, WebRtcTransport>>();
const socketProducers = new Map<string, Map<string, Producer>>();
const socketConsumers = new Map<string, Map<string, Consumer>>();

function getTransports(socketId: string): Map<string, WebRtcTransport> {
  if (!socketTransports.has(socketId)) socketTransports.set(socketId, new Map());
  return socketTransports.get(socketId)!;
}
function getProducers(socketId: string): Map<string, Producer> {
  if (!socketProducers.has(socketId)) socketProducers.set(socketId, new Map());
  return socketProducers.get(socketId)!;
}
function getConsumers(socketId: string): Map<string, Consumer> {
  if (!socketConsumers.has(socketId)) socketConsumers.set(socketId, new Map());
  return socketConsumers.get(socketId)!;
}

export function registerMediaHandlers(io: Server, socket: AuthenticatedSocket): void {
  const { uid } = socket.data;

  // ─── CREATE TRANSPORT ─────────────────────────────────────────────────────
  socket.on('transport:create', async (
    data: { direction: 'send' | 'recv' },
    cb: (res: { error?: string; params?: unknown }) => void,
  ) => {
    try {
      const roomId = socket.data.roomId;
      if (!roomId) return cb({ error: 'NOT_IN_ROOM' });

      const router = workerPool.getRouter(roomId);
      if (!router) return cb({ error: 'ROUTER_NOT_FOUND' });

      const transport = await router.createWebRtcTransport({...webRtcTransportOptions, appData: {direction: data.direction}});

      // Store transport
      getTransports(socket.id).set(transport.id, transport);

      transport.on('dtlsstatechange', (state) => {
        if (state === 'failed' || state === 'closed') {
          logger.warn({ transportId: transport.id, state }, 'Transport DTLS state');
          transport.close();
        }
      });

      cb({
        params: {
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
          iceServers: getIceServers()
        },
      });
    } catch (err) {
      logger.error({ err }, 'transport:create error');
      cb({ error: 'Failed to create transport' });
    }
  });

  // ─── CONNECT TRANSPORT ────────────────────────────────────────────────────
  socket.on('transport:connect', async (
    data: { transportId: string; dtlsParameters: unknown },
    cb: (res: { error?: string }) => void,
  ) => {
    try {
      const transport = getTransports(socket.id).get(data.transportId);
      if (!transport) return cb({ error: 'TRANSPORT_NOT_FOUND' });
      await transport.connect({ dtlsParameters: data.dtlsParameters as never });
      cb({});
    } catch (err) {
      logger.error({ err }, 'transport:connect error');
      cb({ error: 'Failed to connect transport' });
    }
  });

  // ─── PRODUCE ─────────────────────────────────────────────────────────────
  socket.on('produce', async (
    data: {
      transportId: string;
      kind: 'audio' | 'video';
      rtpParameters: unknown;
      appData?: Record<string, unknown>;
    },
    cb: (res: { error?: string; producerId?: string }) => void,
  ) => {
    try {
      const roomId = socket.data.roomId;
      if (!roomId) return cb({ error: 'NOT_IN_ROOM' });

      const room = await getRoom(roomId);
      if (!room) return cb({ error: 'ROOM_NOT_FOUND' });

      // Broadcast mode: only broadcaster/host can produce
      if (room.mode === 'broadcast') {
        const participant = await getParticipant(roomId, socket.id);
        if (participant && participant.role === 'viewer') {
          return cb({ error: 'VIEWERS_CANNOT_PRODUCE' });
        }
      }

      const transport = getTransports(socket.id).get(data.transportId);
      if (!transport) return cb({ error: 'TRANSPORT_NOT_FOUND' });

      const isScreenShare = data.appData?.isScreenShare === true;

      const producer = await transport.produce({
        kind: data.kind,
        rtpParameters: data.rtpParameters as never,
        appData: data.appData,
      });

      getProducers(socket.id).set(producer.id, producer);

      // Register in Redis for cross-socket awareness
      await registerProducer(roomId, producer.id, {
        producerId: producer.id,
        socketId: socket.id,
        userId: uid,
        displayName: socket.data.displayName,
        kind: data.kind,
        paused: false,
        isScreenShare,
      });

      producer.on('score', (scores) => {
        socket.emit('producer:score', { producerId: producer.id, scores });
      });

      // Notify all others in the room
      socket.to(roomId).emit('new:producer', {
        producerId: producer.id,
        socketId: socket.id,
        userId: uid,
        displayName: socket.data.displayName,
        kind: data.kind,
        isScreenShare,
      });

      cb({ producerId: producer.id });
    } catch (err) {
      logger.error({ err }, 'produce error');
      cb({ error: 'Failed to produce' });
    }
  });

  // ─── CONSUME ─────────────────────────────────────────────────────────────
  socket.on('consume', async (
    data: { producerId: string; rtpCapabilities: unknown },
    cb: (res: { error?: string; params?: unknown }) => void,
  ) => {
    try {
      const roomId = socket.data.roomId;
      if (!roomId) return cb({ error: 'NOT_IN_ROOM' });

      const router = workerPool.getRouter(roomId);
      if (!router) return cb({ error: 'ROUTER_NOT_FOUND' });

      if (!router.canConsume({ producerId: data.producerId, rtpCapabilities: data.rtpCapabilities as never })) {
        return cb({ error: 'CANNOT_CONSUME' });
      }

      // Find a recv transport for this socket
      const transports = getTransports(socket.id);
      // let recvTransport: WebRtcTransport | undefined;
      // for (const [, t] of transports) {
      //   // Heuristic: recv transport has no producers attached
      //   const producers = getProducers(socket.id);
      //   let hasSendProducer = false;
      //   for (const [, p] of producers) {
      //     if ((p as unknown as { transport?: { id: string } }).transport?.id === t.id) {
      //       hasSendProducer = true;
      //       break;
      //     }
      //   }
      //   if (!hasSendProducer) { recvTransport = t; break; }
      // }

      // // If no recv transport found, use any (consumer will sort it out)
      // if (!recvTransport) {
      //   const firstEntry = transports.entries().next();
      //   if (!firstEntry.done) recvTransport = firstEntry.value[1];
      // }

      // if (!recvTransport) return cb({ error: 'NO_RECV_TRANSPORT' });

      let recvTransport: WebRtcTransport | undefined;
for (const [, t] of getTransports(socket.id)) {
  if ((t.appData as any).direction === 'recv') {
    recvTransport = t;
    break;
  }
}
if (!recvTransport) return cb({ error: 'NO_RECV_TRANSPORT' });


      const consumer = await recvTransport.consume({
        producerId: data.producerId,
        rtpCapabilities: data.rtpCapabilities as never,
        paused: true, // start paused, client resumes
      });

      getConsumers(socket.id).set(consumer.id, consumer);

      consumer.on('transportclose', () => consumer.close());
      consumer.on('producerclose', () => {
        consumer.close();
        socket.emit('consumer:closed', { consumerId: consumer.id });
      });
      consumer.on('score', (score) => {
        socket.emit('consumer:score', { consumerId: consumer.id, score });
      });

      cb({
        params: {
          id: consumer.id,
          producerId: data.producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        },
      });
    } catch (err) {
      logger.error({ err }, 'consume error');
      cb({ error: 'Failed to consume' });
    }
  });

  // ─── RESUME CONSUMER ──────────────────────────────────────────────────────
  socket.on('consumer:resume', async (
    data: { consumerId: string },
    cb: (res: { error?: string }) => void,
  ) => {
    try {
      const consumer = getConsumers(socket.id).get(data.consumerId);
      if (!consumer) return cb({ error: 'CONSUMER_NOT_FOUND' });
      logger.info("consumer resumed")
      await consumer.resume();
      cb({});
    } catch (err) {
      cb({ error: 'Failed' });
    }
  });

  // ─── PAUSE/RESUME PRODUCER ────────────────────────────────────────────────
  socket.on('producer:pause', async (data: { producerId: string }, cb: (res: { error?: string }) => void) => {
    try {
      const producer = getProducers(socket.id).get(data.producerId);
      if (!producer) return cb({ error: 'PRODUCER_NOT_FOUND' });
      await producer.pause();
      const roomId = socket.data.roomId;
      if (roomId) socket.to(roomId).emit('producer:paused', { producerId: data.producerId, socketId: socket.id });
      cb({});
    } catch (err) {
      cb({ error: 'Failed' });
    }
  });

  socket.on('producer:resume', async (data: { producerId: string }, cb: (res: { error?: string }) => void) => {
    try {
      const producer = getProducers(socket.id).get(data.producerId);
      if (!producer) return cb({ error: 'PRODUCER_NOT_FOUND' });
      await producer.resume();
      const roomId = socket.data.roomId;
      if (roomId) socket.to(roomId).emit('producer:resumed', { producerId: data.producerId, socketId: socket.id });
      cb({});
    } catch (err) {
      cb({ error: 'Failed' });
    }
  });

  // ─── CLOSE PRODUCER ───────────────────────────────────────────────────────
  socket.on('producer:close', async (data: { producerId: string }) => {
    const producer = getProducers(socket.id).get(data.producerId);
    if (!producer) return;
    producer.close();
    getProducers(socket.id).delete(data.producerId);
    const roomId = socket.data.roomId;
    if (roomId) {
      await unregisterProducer(roomId, data.producerId);
      socket.to(roomId).emit('producer:closed', { producerId: data.producerId, socketId: socket.id });
    }
  });

  // ─── AUDIO LEVEL ─────────────────────────────────────────────────────────
  socket.on('audio:level', (data: { level: number }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.to(roomId).emit('audio:level', {
      socketId: socket.id,
      userId: uid,
      level: Math.max(0, Math.min(100, data.level)),
    });
  });

  // ─── GET RTP CAPABILITIES ─────────────────────────────────────────────────
  socket.on('rtp:capabilities', async (cb: (res: { error?: string; rtpCapabilities?: unknown }) => void) => {
    try {
      const roomId = socket.data.roomId;
      if (!roomId) return cb({ error: 'NOT_IN_ROOM' });
      const router = workerPool.getRouter(roomId);
      if (!router) return cb({ error: 'ROUTER_NOT_FOUND' });
      cb({ rtpCapabilities: router.rtpCapabilities });
    } catch (err) {
      cb({ error: 'Failed' });
    }
  });

  socket.on("requestKeyFrame", ({ roomId, consumerId }) => {
    const consumer = getConsumers(socket.id).get(consumerId)

    // for (const peerInfo of room.peers.values()) {
    //   const c = peerInfo.consumers.get(consumerId);
    //   if (c) {
    //     c.requestKeyFrame().catch(() => {});
    //     break;
    //   }
    // }
    if (consumer) {
      consumer.requestKeyFrame().catch(() => {})
    }
  });
}

export function cleanupSocketMedia(socketId: string): void {
  // Close all producers
  const producers = socketProducers.get(socketId);
  if (producers) {
    for (const [, producer] of producers) {
      try { producer.close(); } catch {}
    }
    socketProducers.delete(socketId);
  }

  // Close all consumers
  const consumers = socketConsumers.get(socketId);
  if (consumers) {
    for (const [, consumer] of consumers) {
      try { consumer.close(); } catch {}
    }
    socketConsumers.delete(socketId);
  }

  // Close all transports
  const transports = socketTransports.get(socketId);
  if (transports) {
    for (const [, transport] of transports) {
      try { transport.close(); } catch {}
    }
    socketTransports.delete(socketId);
  }
}