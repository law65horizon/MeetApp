const {getOrCreateRoom, getRoom, deleteRoom} = require("../mediasoup/roomManager");
const {getNextWorker} = require("../mediasoup/workerManager")
const os = require("os")
const config = require("../config")

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

module.exports = (socket) => {
  // ── joinRoom ─────────────────────────────────────────────────────────────
  // appUserId = the Firebase UID (or guest nanoid) sent from the client.
  // We store it alongside socketId so every newProducer event carries the
  // correct app-level identity regardless of what appData contains.
  socket.on("joinRoom", async ({ roomId, rtpCapabilities, appUserId, appUserName }, cb) => {
    try {
        const worker = getNextWorker();
        const room = await getOrCreateRoom(worker, roomId);
        socket.data.roomId = roomId;
        socket.data.appUserId = appUserId; // store for use in produce / getProducers
        socket.join(roomId);
    
        const peer = {
            appUserId,
            appUserName,
            rtpCapabilities,
            transports: new Map(),
            producers: new Map(),
            consumers: new Map()
        }
    
        room.addPeer(socket.id, peer)
    
        const peers= [...room.peers.values()].map(peer => ({ 
          id: peer.appUserId, 
          name: peer.appUserName === appUserName ? `You(${peer.appUserName})` : peer.appUserName
        })) 
    
        // console.log({peers: room.peers.map(room => {id: room.appUserId, name: room.appUserName})})
    
        console.log(`Peer ${socket.id} (appUserId=${appUserId}) joined room ${roomId}`);

        socket.broadcast.to(roomId).emit("peerJoined", {
          peerId: appUserId, 
          peerUserName: appUserName,
          socketId: socket.id,
        });
        cb({ rtpCapabilities: room.router.rtpCapabilities, peers });
    } catch (error) {
        console.error(error)
        cb({ error: error.message})
    }
  });

  // ── createWebRtcTransport ─────────────────────────────────────────────────
  socket.on("createWebRtcTransport", async ({ roomId, direction }, cb) => {
    try {
        const room = getRoom(roomId);
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
          iceServers: config.iceServers,
        });
    } catch (error) {
        console.error(error)
        cb({error: error.message})
    }
  });

  // ── connectTransport ──────────────────────────────────────────────────────
  socket.on("connectTransport", async ({ roomId, transportId, dtlsParameters }, cb) => {
    try {
        const room = getRoom(roomId)
        if (!room) return cb({ error: "Room not found" });
    
        const peer = room.peers.get(socket.id);
        if (!peer) return cb({ error: "Peer not found" });
    
        const transport = peer.transports.get(transportId);
        if (!transport) return cb({ error: "Transport not found" });
    
        await transport.connect({ dtlsParameters });
        cb({ connected: true });
    } catch (error) {
        cb({error: error.message})
    }
  });

  // ── produce ───────────────────────────────────────────────────────────────
  socket.on("produce", async ({ roomId, transportId, kind, rtpParameters, appData }, cb) => {
    try {
        const room = getRoom(roomId)
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
    } catch (error) {
        cb({error: error.message})
    }
  });

  // ── closeProducer ─────────────────────────────────────────────────────────
  socket.on("closeProducer", ({ roomId, producerId }, cb) => {
    try {
        const room = getRoom(roomId)
        if (!room) return cb?.({ error: "Room not found" });
    
        const producers = room.peers.get(socket.id)?.producers;
        const producer = producers?.get(producerId);
        if (!producer) return cb?.({ error: "Producer not found" });
    
        producer.close();
        producers.delete(producerId);
        // Tell others this producer is gone
        socket.broadcast.to(roomId).emit("producerClosed", { producerId });
        cb?.({ closed: true });
    } catch (error) {
        cb({error: error.message})
    }
  });

  // ── replaceTrack (for mute/screenshare without renegotiation) ─────────────
  socket.on("pauseProducer", async ({ roomId, producerId }, cb) => {
    try {
        const room = getRoom(roomId)
        const producer = room?.peers.get(socket.id)?.producers.get(producerId);
        if (!producer) return cb?.({ error: "Producer not found" });
        await producer.pause();
        cb?.({ paused: true });
    } catch (error) {
        cb({error: error.message})
    }
  });

  socket.on("resumeProducer", async ({ roomId, producerId }, cb) => {
    try {
        const room = getRoom(roomId)
        const producer = room?.peers.get(socket.id)?.producers.get(producerId);
        if (!producer) return cb?.({ error: "Producer not found" });
        await producer.resume();
        cb?.({ resumed: true });
    } catch (error) {
        cb({error: error.message})
    }
  });

  // ── getProducers ──────────────────────────────────────────────────────────
  socket.on("getProducers", ({ roomId, clientRtpCapabilities }, cb) => {
    const room = getRoom(roomId)
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
      const room = getRoom(roomId)
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
    const room = getRoom(roomId)
    const consumer = room?.peers.get(socket.id)?.consumers.get(consumerId);
    if (!consumer) return cb({ error: "Consumer not found" });

    await consumer.resume();
    cb({ resumed: true });
  });

  // ── requestKeyFrame ───────────────────────────────────────────────────────
  socket.on("requestKeyFrame", ({ roomId, consumerId }) => {
    const room = getRoom(roomId)
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
    const room = getRoom(roomId)
    if (!room) return;

    // const producerIds = room.getProducerIds()
    const peerInfo = room.peers.get(socket.id);
    if (!peerInfo) return;

    // Collect producer IDs before closing so the other side can clean up
    const producerIds = [...peerInfo.producers.keys()];

    room.removePeer(socket.id)
    console.log(`Peer ${socket.id} disconnected from room ${roomId}`);

    socket.broadcast.to(roomId).emit("peerLeft", {
      peerId: peerInfo.appUserId ?? socket.id,  // app-level ID so client can delete stream
      socketId: socket.id,
      producerIds,
    });

    // Clean up empty rooms
    if (room.peers.size === 0) {
        deleteRoom(roomId)
    }
  });
}