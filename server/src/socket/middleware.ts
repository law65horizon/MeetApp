import type { Socket } from 'socket.io';
import { verifyToken } from '../firebase';
import { logger } from '../lib/logger';
import { getRoom } from '../redis/roomRepository';

export interface AuthenticatedSocket extends Socket {
  data: {
    uid: string;
    displayName: string;
    email: string | null;
    photoURL: string | null;
    roomId?: string;
  };
}

export async function authMiddleware(socket: Socket, next: (err?: Error) => void): Promise<void> {
  const token = socket.handshake.auth?.token as string | undefined;
  const roomId = socket.handshake.auth?.roomId as string | undefined;
  const displayName = socket.handshake.auth?.displayName as string | undefined;
 
  if (!token && !displayName) return next(new Error('INVALID_IDENTIFIER'))
  console.log({roomId, token, displayName})
  if (!roomId) {
    return next(new Error('NOT_IN_ROOM'))
  }
  const meta = await getRoom(roomId)
  // console.log({meta})

  if (meta?.private) {
    if (!token) return next(new Error('AUTH_MISSING'));
    verifyToken(token)
      .then((decoded) => {
        socket.data.uid = decoded.uid;
        socket.data.displayName = decoded.name ?? decoded.email ?? 'Guest';
        socket.data.email = decoded.email ?? null;
        socket.data.photoURL = decoded.picture ?? null;
        next();
      })
      .catch((err) => {
        logger.warn({ err: err.message }, 'Token verification failed');
        next(new Error('AUTH_INVALID'));
      });
  } else {
    if (token) {
      verifyToken(token)
        .then((decoded) => {
          socket.data.uid = decoded.uid;
          socket.data.displayName = decoded.name ?? decoded.email ?? 'Guest';
          socket.data.email = decoded.email ?? null;
          socket.data.photoURL = decoded.picture ?? null;
          next();
        })
        .catch((err) => {
          logger.warn({ err: err.message }, 'Token verification failed');
          next(new Error('AUTH_INVALID'));
        });
    } else {
      const uid = crypto.randomUUID()
      socket.data.uid = uid
      socket.data.displayName = displayName
      next()
    }
  }
}

export const httpAuthMiddleware = (req:any, res:any, next:any) => {
 const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: "Token missing" });

  verifyToken(token)
    .then((decoded) => {
      req.user = decoded
      next();
    })
    .catch((err) => {
      const message = err.name === 'TokenExpiredError' ? "Token expired" : "Invalid token";
      return res.status(401).json({ message });
    });
}