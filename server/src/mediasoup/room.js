

class Room {
    constructor(router) {
        this.router = router;
        this.peers = new Map()
    }

    get id() {
        return this.router.id
    }
    
    getProducerIds(socketId) {
        const peerInfo = this.peers.get(socketId)
        return [...peerInfo.producers.keys()]
    }

    addPeer(socketId, peerData) {
        this.peers.set(socketId, peerData);
    }

    removePeer(socketId) {
        const peer = this.peers.get(socketId);
        if (!peer) return;

        peer.transports.forEach((t) => t.close())
        peer.producers.forEach((t) => t.close())
        peer.consumers.forEach((t) => t.close())

        this.peers.delete(socketId)
    }

    size() {
        return this.peers.size
    }
}

module.exports = Room;