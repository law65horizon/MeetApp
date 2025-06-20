
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require('cors');
const mediasoup = require("mediasoup");

// 1) Basic Express + HTTP + Socket.IO setup
const app = express();
const server = http.createServer(app);

app.use(cors())
app.use(express.static('public'))
server.listen(3000, () => {
  console.log("Server is listening on port 3000");
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
  // Pass desired options (optional). See WorkerSettings in docs.
  const worker = await mediasoup.createWorker({
    rtcMinPort: 2000,
    rtcMaxPort: 2020,
    logLevel: "warn",
    logTags: [ "info", "ice", "dtls" ]
  }); // :contentReference[oaicite:4]{index=4}

  worker.on("died", () => {
    console.error("mediasoup Worker died, exiting in 2 seconds ...");
    setTimeout(() => process.exit(1), 2000);
  });

  return worker;
}

(async () => {
  const worker = await createWorker();
  // Each room will use its own Router
  io.on("connection", (socket) => handleSocket(socket, worker));
  
})();


async function getOrCreateRouter(worker, roomId) {
  let room = rooms.get(roomId);

  if (!room) {
    // Create a new Router for this room
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
    const router = await worker.createRouter({ mediaCodecs }); // :contentReference[oaicite:6]{index=6}

    room = {
      router,
      peers: new Map()  // socketId → { transports, producers, consumers, rtpCapabilities }
    };
    rooms.set(roomId, room);
  }

  return room;
}



async function handleSocket(socket, worker) {
  // Expect `joinRoom` from client with { roomId, rtpCapabilities }
  socket.on("joinRoom", async (data, callback) => {
    const { roomId, rtpCapabilities } = data;
    const room = await getOrCreateRouter(worker, roomId);
    if(room) {
        socket.data.roomId = roomId;
    }

    // Verify the client’s RTP Capabilities are valid
    const canConsume = room.router.canConsume({
      producerId: null,      // no producer yet
      rtpCapabilities       // client's local caps
    }); // We’re only checking validity; canConsume returns false/throws if unsupported. :contentReference[oaicite:8]{index=8}

    // Store the Peer’s info
    room.peers.set(socket.id, {
      rtpCapabilities,
      transports    : new Map(),
      producers     : new Map(),
      consumers     : new Map()
    });

    console.log('room joined successfully',socket.id, roomId)

    // Reply with Router’s RTP capabilities for client to load
    callback({
      rtpCapabilities: room.router.rtpCapabilities // :contentReference[oaicite:9]{index=9}
    });
  });

  // 2.4.1. createWebRtcTransport for Send / Recv
  socket.on("createWebRtcTransport", async (data, callback) => {
    /*
      data = {
        roomId,
        clientRtpCapabilities, // so we can confirm they can produce
        direction              // "send" or "recv"
      }
    */
    const room = rooms.get(data.roomId);
    if (!room) return callback({ error: "Room does not exist" });

    // Only allow createRecvTransport if the client’s rtpCaps can consume
    if (data.direction === "recv") {
      const anyProducerId = [...room.peers.values()][0]?.producers.keys().next().value;
      if (anyProducerId) {
        // Validate canConsume before creating a recv transport
        const canConsume = room.router.canConsume({
          producerId     : anyProducerId,
          rtpCapabilities: data.clientRtpCapabilities
        });
        if (!canConsume) {
          return callback({ error: "Cannot consume any existing producer." });
        }
      }
    }

    // Create a WebRtcTransport on the Router
    const transportOptions = {
      listenIps : [ { ip: "0.0.0.0", announcedIp: null } ],
      enableUdp : true,
      enableTcp : true,
      preferUdp : true,
      initialAvailableOutgoingBitrate: 1000000
    };

    const transport = await room.router.createWebRtcTransport(transportOptions); // :contentReference[oaicite:10]{index=10}

    room.peers.get(socket.id).transports.set(transport.id, transport);

    // Send transport params back to client so it can do transport.connect()
    callback({
      id           : transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters
    });
  });

  // 2.4.2. connectTransport (DTLS handshake)
  socket.on("connectTransport", async (data, callback) => {
    /*
      data = {
        transportId,
        dtlsParameters
      }
    */
    const room = rooms.get(data.roomId);
    const transport = room.peers.get(socket.id).transports.get(data.transportId);
    if (!transport) return callback({ error: "Transport not found" });

    await transport.connect({ dtlsParameters: data.dtlsParameters }); // :contentReference[oaicite:11]{index=11}
    callback({ connected: true });
  });

  // 2.4.3. produce (send a new track)
  socket.on("produce", async (data, callback) => {
    /*
      data = {
        roomId,
        transportId,
        kind,             // "audio" or "video"
        rtpParameters,    // coming from client
        appData           // optional metadata (e.g., peer name)
      }
    */
    const room = rooms.get(data.roomId);
    const transport = room.peers.get(socket.id).transports.get(data.transportId);
    if (!transport) return callback({ error: "Transport not found" });

    // Create a Producer on the server from client’s rtpParams
    const producer = await transport.produce({
      kind        : data.kind,
      rtpParameters: data.rtpParameters,
      appData     : data.appData || {}
    }); // :contentReference[oaicite:12]{index=12}

    room.peers.get(socket.id).producers.set(producer.id, producer);

    // Listen for transportclose & producerclose
    transport.observer.on("close", () => {
      producer.close();
    });

    producer.observer.on("close", () => {
      // Cleanup on producer close
      room.peers.get(socket.id).producers.delete(producer.id);
      // Notify all clients to close their corresponding consumers
      socket.broadcast.to(data.roomId).emit("producerClosed", { producerId: producer.id });
    });

    // Notify existing peers that there’s a new Producer
    socket.broadcast.to(data.roomId).emit("newProducer", {
      producerId: producer.id,
      kind      : data.kind
    });

    callback({ id: producer.id });
  });

  // 2.4.4. consume (create a Consumer for a given Producer)
  socket.on("consume", async (data, callback) => {
    /*
      data = {
        roomId,
        consumerTransportId,
        producerId,
        clientRtpCapabilities
      }
    */
    const room = rooms.get(data.roomId);
    const peerInfo = room.peers.get(socket.id);
    const router = room.router;

    // Ensure the consumer can actually consume the given Producer
    if (!router.canConsume({
      producerId     : data.producerId,
      rtpCapabilities: data.clientRtpCapabilities
    })) {
      return callback({ error: "Cannot consume" });
    }

    const transport = peerInfo.transports.get(data.consumerTransportId);
    if (!transport) return callback({ error: "Transport not found" });

    // Create the Consumer
    const consumer = await transport.consume({
      producerId     : data.producerId,
      rtpCapabilities: data.clientRtpCapabilities,
      paused         : true  // start paused, then client will call consumer.resume()
    }); // :contentReference[oaicite:13]{index=13}

    // Store consumer so we can pause/resume/close later
    peerInfo.consumers.set(consumer.id, consumer);

    // Respond with consumer params so client can setRemoteDescription() & start
    callback({
      id             : consumer.id,
      producerId     : data.producerId,
      kind           : consumer.kind,
      rtpParameters  : consumer.rtpParameters,
      type           : consumer.type,
      appData        : consumer.appData
    });

    // Once client has created the Consumer in browser, it will send a "consumerResume" event
  });

  // 2.4.5. resume a paused Consumer (once client calls .resume() locally)
  socket.on("consumerResume", async (data, callback) => {
    const room = rooms.get(data.roomId);
    const consumer = room.peers.get(socket.id).consumers.get(data.consumerId);
    if (!consumer) return callback({ error: "Consumer not found" });

    await consumer.resume(); // :contentReference[oaicite:14]{index=14}
    callback({ resumed: true });
  });

  // 2.4.6. Handle disconnection / cleanup
  socket.on("disconnect", () => {
    const roomId = socket.data.roomId; // you should have stored this per-socket
    const room = rooms.get(roomId);
    if (!room) {
        console.log('No room found disconnect');
        return;
    };

    // Close all Transports, Producers, Consumers for this peer
    const peerInfo = room.peers.get(socket.id);
    peerInfo.transports.forEach(t => t.close());
    peerInfo.producers.forEach(p => p.close());
    peerInfo.consumers.forEach(c => c.close());

    room.peers.delete(socket.id);

    // Notify remaining peers that this peer left
    socket.broadcast.to(roomId).emit("peerLeft", { peerId: socket.id });
  });
}
