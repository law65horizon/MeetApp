const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mediasoup = require("mediasoup");
const os = require("os");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the first non-loopback IPv4 address of this machine. */
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const info of iface) {
      if (info.family === "IPv4" && !info.internal) return info.address;
    }
  }
  return "127.0.0.1";
}

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.static("public"));

server.listen(3000, () => {
  console.log("Server listening on port 3000");
});

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// ---------------------------------------------------------------------------
// ICE servers (exposed to every client)
// ---------------------------------------------------------------------------
// Using freestun.net as a no-registration TURN server for development.
// For production replace with Metered / Twilio / your own coturn instance.
const ICE_SERVERS = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  // Free TURN — good for dev / testing (1 GB / month, no auth needed)
  {
    urls: ["turn:freestun.net:3478"],
    username: "free",
    credential: "free",
  },
  // TLS variant to pierce strict firewalls
  {
    urls: ["turns:freestun.net:5349"],
    username: "free",
    credential: "free",
  },
];

// ---------------------------------------------------------------------------
// Room state
// ---------------------------------------------------------------------------

const rooms = new Map();
/*
  rooms: Map<roomId, {
    router: Router,
    peers: Map<socketId, {
      rtpCapabilities,
      transports: Map<id, Transport>,
      producers: Map<id, Producer>,
      consumers: Map<id, Consumer>,
    }>
  }>
*/

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

async function createWorker() {
  const worker = await mediasoup.createWorker({
    rtcMinPort: 10000,
    rtcMaxPort: 10100,
    logLevel: "warn",
    logTags: ["ice", "dtls"],
  });

  worker.on("died", () => {
    console.error("mediasoup Worker died, restarting in 2 s…");
    setTimeout(() => process.exit(1), 2000);
  });

  console.log("mediasoup Worker ready, PID:", worker.pid);
  return worker;
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

(async () => {
  const worker = await createWorker();

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    handleSocket(socket, worker);
  });
})();

// ---------------------------------------------------------------------------
// Router helpers
// ---------------------------------------------------------------------------

async function getOrCreateRouter(worker, roomId) {
  let room = rooms.get(roomId);
  if (room) return room;

  const mediaCodecs = [
    {
      kind: "audio",
      mimeType: "audio/opus",
      clockRate: 48000,
      channels: 2,
    },
    {
      kind: "video",
      mimeType: "video/VP8",
      clockRate: 90000,
      parameters: { "x-google-start-bitrate": 1000 },
    },
    {
      kind: "video",
      mimeType: "video/H264",
      clockRate: 90000,
      parameters: {
        "packetization-mode": 1,
        "profile-level-id": "42e01f",
        "level-asymmetry-allowed": 1,
      },
    },
  ];

  const router = await worker.createRouter({ mediaCodecs });
  room = { router, peers: new Map() };
  rooms.set(roomId, room);
  console.log(`Room ${roomId} created, router ${router.id}`);
  return room;
}

// ---------------------------------------------------------------------------
// Socket handler
// ---------------------------------------------------------------------------

async function handleSocket(socket, worker) {
  // ── joinRoom ─────────────────────────────────────────────────────────────
  // appUserId = the Firebase UID (or guest nanoid) sent from the client.
  // We store it alongside socketId so every newProducer event carries the
  // correct app-level identity regardless of what appData contains.
  socket.on("joinRoom", async ({ roomId, rtpCapabilities, appUserId, appUserName }, cb) => {
    const room = await getOrCreateRouter(worker, roomId);
    socket.data.roomId = roomId;
    socket.data.appUserId = appUserId; // store for use in produce / getProducers
    socket.join(roomId);

    room.peers.set(socket.id, {
      appUserId,               // ← the reliable app-level peer identity
      appUserName,
      rtpCapabilities,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
    });

    const peers= [...room.peers.values()].map(peer => ({ 
      id: peer.appUserId, 
      name: peer.appUserName === appUserName ? `You(${peer.appUserName})` : peer.appUserName
    })) 

    // console.log({peers: room.peers.map(room => {id: room.appUserId, name: room.appUserName})})

    console.log(`Peer ${socket.id} (appUserId=${appUserId}) joined room ${roomId}`);
    try {
      socket.broadcast.to(roomId).emit("peerJoined", {
        peerId: appUserId, 
        peerUserName: appUserName,
        socketId: socket.id,
      });

      console.log({appUserId, peers})
      console.log('peer join emmited')
    } catch (error) {
      console.log('peer join failed')
    }
    cb({ rtpCapabilities: room.router.rtpCapabilities, peers });
  });

  // ── createWebRtcTransport ─────────────────────────────────────────────────
  socket.on("createWebRtcTransport", async ({ roomId, direction }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb({ error: "Room not found" });

    const localIp = getLocalIp();

    const transport = await room.router.createWebRtcTransport({
      listenInfos: [
        { protocol: "udp", ip: "0.0.0.0", announcedAddress: localIp },
        { protocol: "tcp", ip: "0.0.0.0", announcedAddress: localIp },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 600_000,
    });

    transport.on("dtlsstatechange", (state) => {
      if (state === "failed" || state === "closed") {
        console.warn(`Transport ${transport.id} DTLS ${state}`);
        transport.close();
      }
    });

    room.peers.get(socket.id).transports.set(transport.id, transport);

    cb({
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      // Send ICE server list so client can add TURN
      iceServers: ICE_SERVERS,
    });
  });

  // ── connectTransport ──────────────────────────────────────────────────────
  socket.on("connectTransport", async ({ roomId, transportId, dtlsParameters }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb({ error: "Room not found" });

    const peer = room.peers.get(socket.id);
    if (!peer) return cb({ error: "Peer not found" });

    const transport = peer.transports.get(transportId);
    if (!transport) return cb({ error: "Transport not found" });

    await transport.connect({ dtlsParameters });
    cb({ connected: true });
  });

  // ── produce ───────────────────────────────────────────────────────────────
  socket.on("produce", async ({ roomId, transportId, kind, rtpParameters, appData }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb({ error: "Room not found" });

    const transport = room.peers.get(socket.id)?.transports.get(transportId);
    if (!transport) return cb({ error: "Transport not found" });

    const producer = await transport.produce({ kind, rtpParameters, appData: appData || {} });
    room.peers.get(socket.id).producers.set(producer.id, producer);

    producer.on("transportclose", () => {
      producer.close();
      room.peers.get(socket.id)?.producers.delete(producer.id);
    });

    // Notify other peers — use the server-stored appUserId, not whatever
    // the client put in appData, so the identity is always reliable.
    const producerPeerAppId = room.peers.get(socket.id)?.appUserId ?? socket.id;
    socket.broadcast.to(roomId).emit("newProducer", {
      producerId: producer.id,
      kind,
      appData: { ...(appData || {}), peerId: producerPeerAppId },
    });

    cb({ id: producer.id });
  });

  // ── closeProducer ─────────────────────────────────────────────────────────
  socket.on("closeProducer", ({ roomId, producerId }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb?.({ error: "Room not found" });

    const producers = room.peers.get(socket.id)?.producers;
    const producer = producers?.get(producerId);
    if (!producer) return cb?.({ error: "Producer not found" });

    producer.close();
    producers.delete(producerId);
    // Tell others this producer is gone
    socket.broadcast.to(roomId).emit("producerClosed", { producerId });
    cb?.({ closed: true });
  });

  // ── replaceTrack (for mute/screenshare without renegotiation) ─────────────
  socket.on("pauseProducer", async ({ roomId, producerId }, cb) => {
    const room = rooms.get(roomId);
    const producer = room?.peers.get(socket.id)?.producers.get(producerId);
    if (!producer) return cb?.({ error: "Producer not found" });
    await producer.pause();
    cb?.({ paused: true });
  });

  socket.on("resumeProducer", async ({ roomId, producerId }, cb) => {
    const room = rooms.get(roomId);
    const producer = room?.peers.get(socket.id)?.producers.get(producerId);
    if (!producer) return cb?.({ error: "Producer not found" });
    await producer.resume();
    cb?.({ resumed: true });
  });

  // ── getProducers ──────────────────────────────────────────────────────────
  socket.on("getProducers", ({ roomId, clientRtpCapabilities }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb?.({ error: "Room not found" });

    const myConsumers = room.peers.get(socket.id)?.consumers ?? new Map();

    for (const [peerId, peerInfo] of room.peers.entries()) {
      if (peerId === socket.id) continue;

      for (const [producerId, producer] of peerInfo.producers.entries()) {
        const alreadyConsuming = [...myConsumers.values()].some(
          (c) => c.producerId === producerId
        );
        if (alreadyConsuming) continue;

        if (
          !room.router.canConsume({
            producerId,
            rtpCapabilities: clientRtpCapabilities,
          })
        ) {
          console.warn(`Cannot consume producer ${producerId} for peer ${socket.id}`);
          continue; // skip, don't abort the whole loop
        }

        socket.emit("newProducer", {
          producerId,
          kind: producer.kind,
          // Always use the server-stored appUserId — never trust appData alone
          appData: { ...(producer.appData || {}), peerId: peerInfo.appUserId ?? peerId },
        });
      }
    }
    cb?.({});
  });

  // ── consume ───────────────────────────────────────────────────────────────
  socket.on(
    "consume",
    async ({ roomId, consumerTransportId, producerId, clientRtpCapabilities }, cb) => {
      const room = rooms.get(roomId);
      if (!room) return cb({ error: "Room not found" });

      const peerInfo = room.peers.get(socket.id);
      if (!peerInfo) return cb({ error: "Peer not found" });

      if (
        !room.router.canConsume({ producerId, rtpCapabilities: clientRtpCapabilities })
      ) {
        return cb({ error: "Cannot consume" });
      }

      const transport = peerInfo.transports.get(consumerTransportId);
      if (!transport) return cb({ error: "Transport not found" });

      const consumer = await transport.consume({
        producerId,
        rtpCapabilities: clientRtpCapabilities,
        paused: true, // always start paused; client resumes after binding
      });

      peerInfo.consumers.set(consumer.id, consumer);

      consumer.on("transportclose", () => consumer.close());
      consumer.on("producerclose", () => {
        consumer.close();
        peerInfo.consumers.delete(consumer.id);
        socket.emit("consumerClosed", { consumerId: consumer.id, producerId });
      });

      cb({
        id: consumer.id,
        producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        appData: consumer.appData,
      });
    }
  );

  // ── consumerResume ────────────────────────────────────────────────────────
  socket.on("consumerResume", async ({ roomId, consumerId }, cb) => {
    const room = rooms.get(roomId);
    const consumer = room?.peers.get(socket.id)?.consumers.get(consumerId);
    if (!consumer) return cb({ error: "Consumer not found" });

    await consumer.resume();
    cb({ resumed: true });
  });

  // ── requestKeyFrame ───────────────────────────────────────────────────────
  socket.on("requestKeyFrame", ({ roomId, consumerId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    for (const peerInfo of room.peers.values()) {
      const c = peerInfo.consumers.get(consumerId);
      if (c) {
        c.requestKeyFrame().catch(() => {});
        break;
      }
    }
  });

  socket.on("sendMessage", ({roomId, message}) => {
    const room = rooms.get(roomId)
    if (!room) return;

    if (
      !message?.id ||
      !message?.senderId ||
      typeof message?.content !== "string" ||
      !message.content.trim()
    ) {
      console.warn(`[chat] malformed message from ${socket.id}`);
      return;
    }

    const safe = {
      ...message, 
      text: message.content.slice(0, 2000),
      senderId: room.peers.get(socket.id)?.appUserId ?? message.senderId
    }

    console.log(`[chat] ${safe.senderName}: ${safe.text.slice(0, 60)}`);
    socket.broadcast.to(roomId).emit("chatMessage", safe);
  })

  // ── disconnect ────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    console.log(`Peer ${socket.id} disconnected from room ${roomId}`);
    const room = rooms.get(roomId);
    if (!room) return;

    const peerInfo = room.peers.get(socket.id);
    if (!peerInfo) return;

    // Collect producer IDs before closing so the other side can clean up
    const producerIds = [...peerInfo.producers.keys()];

    peerInfo.transports.forEach((t) => t.close());
    peerInfo.producers.forEach((p) => p.close());
    peerInfo.consumers.forEach((c) => c.close());
    room.peers.delete(socket.id);

    socket.broadcast.to(roomId).emit("peerLeft", {
      peerId: peerInfo.appUserId ?? socket.id,  // app-level ID so client can delete stream
      socketId: socket.id,
      producerIds,
    });

    // Clean up empty rooms
    if (room.peers.size === 0) {
      room.router.close();
      rooms.delete(roomId);
      console.log(`Room ${roomId} cleaned up`);
    }
  });
}