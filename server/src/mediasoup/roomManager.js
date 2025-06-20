const mediasoup = require("mediasoup");
const config = require("../config");
const Room = require("./room");

const rooms = new Map();

async function getOrCreateRoom(worker, roomId) {
//   let room = rooms.get(roomId);
  if (rooms.has(roomId)) return rooms.get(roomId);

  const router = await worker.createRouter({ mediaCodecs: config.mediasoup.router.mediaCodecs });
 
  const room = new Room(router);
  rooms.set(roomId, room)

  console.log(`Room ${roomId} created, router ${router.id}`);
  return room;
}

function getRoom(roomId) {
    return rooms.get(roomId)
}

function deleteRoom(roomId) {
    const room = rooms.get(roomId)
    if (room) {
        room.router.close()
        rooms.delete(roomId)
        console.log(`room ${roomId} deleted`)
    }
}

module.exports = {
    getOrCreateRoom,
    getRoom,
    deleteRoom
}