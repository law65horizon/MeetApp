const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require('cors');
const mediasoup = require("mediasoup");

// 1) Basic Express + HTTP + Socket.IO setup
const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.static('public'));
server.listen(3000, () => {
  console.log("Server started and listening on port 3000");
});

const io = new Server(server, {
    cors: {
        origin: 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true,
    }
});

// 2) Global storage (in production, you’d have a more robust Room/Peer management)
const rooms = new Map();

/**
 * Create a new Worker (one per CPU is recommended).
 * The Worker will manage Routers and Transports.
 */
async function createWorker() {
  console.log("Creating new mediasoup Worker...");
  const worker = await mediasoup.createWorker({
    rtcMinPort: 2000,
    rtcMaxPort: 2020,
    logLevel: "warn",
    logTags: [ "info", "ice", "dtls" ]
  });

  worker.on("died", () => {
    console.error("mediasoup Worker died unexpectedly, exiting in 2 seconds...");
    setTimeout(() => process.exit(1), 2000);
  });

  console.log("mediasoup Worker created successfully with PID:", worker.pid);
  return worker;
}

(async () => {
  console.log("Initializing application with worker creation...");
  const worker = await createWorker();
  console.log("Setting up socket.io connection handler...");
  io.on("connection", (socket) => {
    console.log("New client connected with socket ID:", socket.id);
    handleSocket(socket, worker);
  });
})();

async function getOrCreateRouter(worker, roomId) {
  console.log(`Checking for existing room with ID: ${roomId}`);
  let room = rooms.get(roomId);

  if (!room) {
    console.log(`Room ${roomId} does not exist, creating new Router...`);
    const mediaCodecs = [
      {
        kind       : "audio",
        mimeType   : "audio/opus",
        clockRate  : 48000,
        channels   : 2
      },
      {
        kind       : "video",
        mimeType   : "video/VP8",
        clockRate  : 90000,
        parameters : { "x-google-start-bitrate": 1000 }
      }
    ];
    const router = await worker.createRouter({ mediaCodecs });

    room = {
      router,
      peers: new Map()
    };
    rooms.set(roomId, room);
    console.log(`Room ${roomId} created with Router ID: ${router.id}`);
  } else {
    console.log(`Room ${roomId} already exists, reusing Router ID: ${room.router.id}`);
  }

  return room;
}

async function handleSocket(socket, worker) {
  socket.on("joinRoom", async (data, callback) => {
    const { roomId, rtpCapabilities } = data;
    console.log(`Client ${socket.id} attempting to join room: ${roomId}`);
    
    const room = await getOrCreateRouter(worker, roomId);
    if (room) {
      socket.data.roomId = roomId;
      socket.join(roomId)
      console.log(`Client ${socket.id} assigned to room: ${roomId}`);
    }

    console.log(`Verifying RTP capabilities for client ${socket.id} in room ${roomId}`);
    const canConsume = room.router.canConsume({
      producerId: null,
      rtpCapabilities
    });

    room.peers.set(socket.id, {
      rtpCapabilities,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map()
    });
    console.log(`Stored peer info for client ${socket.id} in room ${roomId}`);

    console.log(`Client ${socket.id} joined room ${roomId} successfully`);
    callback({
      rtpCapabilities: room.router.rtpCapabilities
    });
  });

  socket.on("createWebRtcTransport", async (data, callback) => {
    console.log(`Client ${socket.id} requesting WebRTC transport creation in room ${data.roomId}, direction: ${data.direction}`);
    const room = rooms.get(data.roomId);
    if (!room) {
      console.error(`Room ${data.roomId} not found for transport creation`);
      return callback({ error: "Room does not exist" });
    }

    if (data.direction === "recv") {
      const anyProducerId = [...room.peers.values()][0]?.producers.keys().next().value;
      if (anyProducerId) {
        console.log(`Validating if client ${socket.id} can consume producer ${anyProducerId}`);
        const canConsume = room.router.canConsume({
          producerId: anyProducerId,
          rtpCapabilities: data.clientRtpCapabilities
        });
        if (!canConsume) {
          console.error(`Client ${socket.id} cannot consume producer ${anyProducerId}`);
          return callback({ error: "Cannot consume any existing producer." });
        }
        console.log(`Client ${socket.id} can consume producer ${anyProducerId}`);
      }
    }

    console.log(`Creating WebRTC transport for client ${socket.id} in room ${data.roomId}`);
    const transportOptions = {
      listenIps: [{ ip: "0.0.0.0", announcedIp: null }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1000000,
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
      ]
    };

    const transport = await room.router.createWebRtcTransport(transportOptions);
    console.log(`WebRTC transport created with ID: ${transport.id} for client ${socket.id}`);

    room.peers.get(socket.id).transports.set(transport.id, transport);
    console.log(`Stored transport ${transport.id} for client ${socket.id}`);

    callback({
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters
    });
    console.log(`Sent transport parameters to client ${socket.id}`);
  });

  socket.on("connectTransport", async (data, callback) => {
    console.log(`Client ${socket.id} requesting to connect transport ${data.transportId} in room ${data.roomId}`);
    const room = rooms.get(data.roomId);
    const transport = room.peers.get(socket.id).transports.get(data.transportId);
    if (!transport) {
      console.error(`Transport ${data.transportId} not found for client ${socket.id}`);
      return callback({ error: "Transport not found" });
    }

    await transport.connect({ dtlsParameters: data.dtlsParameters });
    console.log(`Transport ${data.transportId} connected successfully for client ${socket.id}`);
    callback({ connected: true });
  });

  socket.on("produce", async (data, callback) => {
    console.log(`Client ${socket.id} requesting to produce ${data.kind} in room ${data.roomId} on transport ${data.transportId}`);
    const room = rooms.get(data.roomId);
    const transport = room.peers.get(socket.id).transports.get(data.transportId);
    if (!transport) {
      console.error(`Transport ${data.transportId} not found for client ${socket.id}`);
      return callback({ error: "Transport not found" });
    }

    const producer = await transport.produce({
      kind: data.kind,
      rtpParameters: data.rtpParameters,
      appData: data.appData || {}
    });
    console.log(`Producer ${producer.id} created for client ${socket.id}, kind: ${data.kind},`);

    room.peers.get(socket.id).producers.set(producer.id, producer);
    console.log(`Stored producer ${producer.id} for client ${socket.id}`);

    transport.observer.on("close", () => {
      console.log(`Transport ${transport.id} closed, closing producer ${producer.id}`);
      producer.close();
    });

    producer.observer.on("close", () => {
      console.log(`Producer ${producer.id} closed for client ${socket.id}`);
      room.peers.get(socket.id).producers.delete(producer.id);
      socket.broadcast.to(data.roomId).emit("producerClosed", { producerId: producer.id });
      console.log(`Notified peers in room ${data.roomId} of producer ${producer.id} closure`);
    });
    console.log('rooom', data.roomId)
    socket.broadcast.to(data.roomId).emit("newProducer", {
      producerId: producer.id,
      kind: data.kind,
      appData: data.appData
    });
    console.log(`Notified peers in room ${data.roomId} of new producer ${producer.id}`);

    callback({ id: producer.id });
    console.log(`Sent producer ID ${producer.id} to client ${socket.id}`);
  });

  socket.on("consume", async (data, callback) => {
    console.log(`Client ${socket.id} requesting to consume producer ${data.producerId} in room ${data.roomId}`);
    const room = rooms.get(data.roomId);
    const peerInfo = room.peers.get(socket.id);
    const router = room.router;

    if (!router.canConsume({
      producerId: data.producerId,
      rtpCapabilities: data.clientRtpCapabilities
    })) {
      console.error(`Client ${socket.id} cannot consume producer ${data.producerId}`);
      return callback({ error: "Cannot consume" });
    }

    const transport = peerInfo.transports.get(data.consumerTransportId);
    if (!transport) {
      console.error(`Transport ${data.consumerTransportId} not found for client ${socket.id}`);
      return callback({ error: "Transport not found" });
    }

    const consumer = await transport.consume({
      producerId: data.producerId,
      rtpCapabilities: data.clientRtpCapabilities,
      paused: true
    });
    console.log(`Consumer ${consumer.id} created for client ${socket.id} to consume producer ${data.producerId}`);

    peerInfo.consumers.set(consumer.id, consumer);
    console.log(`Stored consumer ${consumer.id} for client ${socket.id}`);

    callback({
      id: consumer.id,
      producerId: data.producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
      appData: consumer.appData
    });
    console.log(`Sent consumer parameters to client ${socket.id} for consumer ${consumer.id}`);
  });

  socket.on("consumerResume", async (data, callback) => {
    console.log(`Client ${socket.id} requesting to resume consumer ${data.consumerId} in room ${data.roomId}`);
    const room = rooms.get(data.roomId);
    const consumer = room.peers.get(socket.id).consumers.get(data.consumerId);
    if (!consumer) {
      console.error(`Consumer ${data.consumerId} not found for client ${socket.id}`);
      return callback({ error: "Consumer not found" });
    }

    await consumer.resume();
    console.log(`Consumer ${data.consumerId} resumed for client ${socket.id}`);
    callback({ resumed: true });
  });

  socket.on("requestKeyFrame", async ({ roomId, consumerId }) => {
  const room = rooms.get(roomId);
  if (!room) {
    console.warn("No such room", roomId);
    return;
  }

  // Step 1: Find the ConsumerImpl
  let targetConsumer = null;
  for (const peerInfo of room.peers.values()) {
    const c = peerInfo.consumers.get(consumerId);
    if (c) {
      targetConsumer = c;
      break;
    }
  }
  if (!targetConsumer) {
    console.warn("Server: cannot find Consumer for ID", consumerId);
    return;
  }

  console.log("Server: about to requestKeyFrame on Consumer", consumerId);
  try {
    targetConsumer.requestKeyFrame();
    console.log("Server: requestKeyFrame() call succeeded for Consumer", consumerId);
  } catch (err) {
    console.error("Server error while requestKeyFrame on Consumer:", err);
  }
});

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    console.log(`Client ${socket.id} disconnected from room ${roomId}`);
    const room = rooms.get(roomId);
    if (!room) {
      console.log(`No room found for disconnected client ${socket.id}`);
      return;
    }

    const peerInfo = room.peers.get(socket.id);
    peerInfo.transports.forEach(t => {
      console.log(`Closing transport ${t.id} for client ${socket.id}`);
      t.close();
    });
    peerInfo.producers.forEach(p => {
      console.log(`Closing producer ${p.id} for client ${socket.id}`);
      p.close();
    });
    peerInfo.consumers.forEach(c => {
      console.log(`Closing consumer ${c.id} for client ${socket.id}`);
      c.close();
    });

    room.peers.delete(socket.id);
    console.log(`Removed peer ${socket.id} from room ${roomId}`);

    socket.broadcast.to(roomId).emit("peerLeft", { peerId: socket.id });
    console.log(`Notified peers in room ${roomId} that client ${socket.id} has left`);
  });
}