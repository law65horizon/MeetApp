import * as admin from 'firebase-admin';
import { config } from '../config';
import { logger } from '../lib/logger';

let app: admin.app.App;

export function initFirebase(): void {
  if (admin.apps.length > 0) return;

  app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: config.FIREBASE_PROJECT_ID,
      privateKey: config.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      clientEmail: config.FIREBASE_CLIENT_EMAIL,
    }),
  });
  // console.log({app})

  logger.info('Firebase Admin initialized');
}

export async function verifyToken(token: string): Promise<admin.auth.DecodedIdToken> {
  return admin.auth(app).verifyIdToken(token);
}