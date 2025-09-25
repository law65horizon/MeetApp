export type RoomMode = 'conference' | 'broadcast';

export interface RoomMeta {
  roomId: string;
  hostId: string;
  hostName: string;
  name: string;
  mode: RoomMode;
  isLocked: boolean;
  password: string | null;
  maxParticipants: number;
  createdAt: number;
  serverId: string;
  private?: boolean
}

export interface ParticipantMeta {
  socketId: string;
  userId: string;
  displayName: string;
  photoURL: string | null;
  roomId: string;
  isHost: boolean;
  /** In broadcast mode, only the host/broadcaster produces media */
  role: 'host' | 'broadcaster' | 'viewer' | 'participant';
  joinedAt: number;
  /** Last heartbeat timestamp — used for stale detection */
  lastSeen: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderPhoto: string | null;
  text: string;
  timestamp: number;
}

export interface WaitingEntry {
  socketId: string;
  userId: string;
  displayName: string;
  photoURL: string | null;
  requestedAt: number;
}

/** Server clock sync packet */
export interface TimeSyncPacket {
  /** Origination timestamp from client (client's Date.now()) */
  t0: number;
  /** Server receive timestamp */
  t1?: number;
  /** Server send timestamp */
  t2?: number;
}

export interface ProducerInfo {
  producerId: string;
  socketId: string;
  userId: string;
  displayName: string;
  kind: 'audio' | 'video';
  paused: boolean;
  /** screenShare producers are tagged separately */
  isScreenShare: boolean;
}