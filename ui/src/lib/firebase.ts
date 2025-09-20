import { initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { nanoid } from "nanoid";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID,
  measurementId: import.meta.env.VITE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };

// ── Auth ──────────────────────────────────────────────────────────────────────

export const createUser = async (email: string, password: string, displayName?: string) => {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(cred.user, { displayName });
    }
    // Create user profile doc
    await setDoc(doc(db, "users", cred.user.uid), {
      uid: cred.user.uid,
      email,
      name: displayName || email.split("@")[0],
      createdAt: serverTimestamp(),
    });
    return cred.user;
  } catch (error: any) {
    throw new Error(error.message);
  }
};

export const signIn = async (email: string, password: string) => {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  } catch (error: any) {
    throw new Error(error.message);
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error: any) {
    throw new Error(error.message);
  }
};

// ── Meetings ──────────────────────────────────────────────────────────────────

export const createMeeting = async (
  isPrivate: boolean,
  passcode: number,
  recipients?: string[],
  description?: string,
  title?: string,
  rules?: any
) => {
  if (!auth.currentUser) {
    throw new Error("User must be logged in to create a meeting");
  }

  const meetingId = nanoid();
  const meetingRef = doc(db, "meetings", meetingId);
  const hostParticipant = {
    id: auth.currentUser.uid,
    name: auth.currentUser.displayName || auth.currentUser.email?.split("@")[0] || "Host",
  };

  const meetingData = {
    id: meetingId,
    hostId: auth.currentUser.uid,
    hostEmail: auth.currentUser.email,
    recipients: recipients ?? [],
    title: title?.trim() || `Meeting with ${hostParticipant.name}`,
    status: "pending",
    createdAt: serverTimestamp(),
    scheduledFor: serverTimestamp(),
    participants: [auth.currentUser.uid],
    participants_data: [hostParticipant],
    isPrivate,
    passcode,
    description: description?.trim() || "",
    rules: rules || {},
  };

  await setDoc(meetingRef, meetingData);
  return {
    participants: meetingData.participants_data,
    meetingId,
    title: meetingData.title,
  };
};

export const joinMeeting = async (
  meetingId: string,
  meetingCode: string,
  fullname: string | undefined
) => {
  const meetingRef = doc(db, "meetings", meetingId);
  const meetingDoc = await getDoc(meetingRef);

  if (!meetingDoc.exists()) throw new Error("Meeting not found");

  const meetingData = meetingDoc.data();

  if (meetingData.status === "closed") throw new Error("This meeting has ended");

  // Validate passcode
  if (String(meetingData.passcode) !== String(meetingCode).trim()) {
    throw new Error("Invalid meeting code");
  }

  // Private meeting — only allowed users can join
  if (
    meetingData.isPrivate &&
    auth.currentUser &&
    ![meetingData.hostId, ...meetingData.recipients].includes(auth.currentUser.uid)
  ) {
    throw new Error("You are not authorized to join this meeting");
  }

  // Determine stable user ID
  let userId: string;
  let displayName: string;

  if (auth.currentUser) {
    userId = auth.currentUser.uid;
    displayName =
      auth.currentUser.displayName ||
      auth.currentUser.email?.split("@")[0] ||
      "User";
  } else {
    const stored = sessionStorage.getItem("guestUserId");
    userId = stored ?? nanoid();
    sessionStorage.setItem("guestUserId", userId);
    if (fullname) sessionStorage.setItem("guestFullname", fullname);
    displayName = fullname || "Guest";
  }

  const alreadyIn = meetingData.participants?.includes(userId);
  const participantEntry = { id: userId, name: displayName };

  await updateDoc(meetingRef, {
    participants: arrayUnion(userId),
    participants_data: arrayUnion(participantEntry),
    status: "active",
    joinedAt: serverTimestamp(),
  });

  return {
    ...meetingData,
    currentParticipant: participantEntry,
    createdAt: meetingData.createdAt?.toDate(),
    scheduledFor: meetingData.scheduledFor?.toDate(),
  };
};

export const endMeeting = async (meetingId: string) => {
  try {
    const meetingRef = doc(db, "meetings", meetingId);
    await updateDoc(meetingRef, {
      status: "ended",
      endedAt: serverTimestamp(),
    });
  } catch (error: any) {
    throw new Error("Failed to end meeting: " + error.message);
  }
};

/**
 * Fetch the authenticated user's meetings from Firestore.
 * Returns { upcoming, previous } split by current time.
 */
export const fetchUserMeetings = async () => {
  if (!auth.currentUser) return { upcoming: [], previous: [] };

  const uid = auth.currentUser.uid;
  const meetingsRef = collection(db, "meetings");

  // Meetings where the user is host or participant
  const q = query(
    meetingsRef,
    where("participants", "array-contains", uid),
    orderBy("createdAt", "desc")
  );

  const snap = await getDocs(q);
  const now = new Date();

  const upcoming: any[] = [];
  const previous: any[] = [];

  snap.forEach((docSnap) => {
    const data = { id: docSnap.id, ...docSnap.data() };
    const scheduled = (data as any).scheduledFor?.toDate
      ? (data as any).scheduledFor.toDate()
      : null;

    if ((data as any).status === "closed" || (data as any).status === "ended") {
      previous.push(data);
    } else if (scheduled && scheduled < now) {
      previous.push(data);
    } else {
      upcoming.push(data);
    }
  });

  return { upcoming, previous };
};

// ── Scheduled Meetings ────────────────────────────────────────────────────────

export interface ScheduleMeetingParams {
  title: string;
  description?: string;
  date: Date;
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
  isPrivate: boolean;
  passcode: number;
  recipients: string[];
  isRecurring: boolean;
  recurrence?: 'daily' | 'weekly' | 'monthly';
}

/**
 * Create a scheduled meeting document in Firestore.
 * Combines the picked date with the HH:MM time strings to produce
 * proper Timestamps for scheduledFor and scheduledEnd.
 */
export const scheduleMeeting = async (params: ScheduleMeetingParams) => {
  if (!auth.currentUser) throw new Error('Must be logged in to schedule a meeting');

  const {
    title, description, date, startTime, endTime,
    isPrivate, passcode, recipients, isRecurring, recurrence,
  } = params;

  // Build full Date objects from the date picker value + time string
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);

  const scheduledFor = new Date(date);
  scheduledFor.setHours(startH, startM, 0, 0);

  const scheduledEnd = new Date(date);
  scheduledEnd.setHours(endH, endM, 0, 0);

  const meetingId = nanoid();
  const hostParticipant = {
    id: auth.currentUser.uid,
    name: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'Host',
  };

  const meetingData = {
    id: meetingId,
    hostId: auth.currentUser.uid,
    hostEmail: auth.currentUser.email,
    title: title.trim(),
    description: description?.trim() || '',
    status: 'scheduled',
    createdAt: serverTimestamp(),
    scheduledFor,
    scheduledEnd,
    participants: [auth.currentUser.uid],
    participants_data: [hostParticipant],
    recipients: recipients ?? [],
    isPrivate,
    passcode,
    isRecurring,
    recurrence: isRecurring ? recurrence : null,
    rules: {},
  };

  await setDoc(doc(db, 'meetings', meetingId), meetingData);
  return { meetingId, title: meetingData.title };
};

// ── User Settings ─────────────────────────────────────────────────────────────

export interface UserSettings {
  language: string;
  timezone: string;
  theme: 'light' | 'dark' | 'system';
  showAnimations: boolean;
  requirePasscodeForPersonal: boolean;
  enableWaitingRoom: boolean;
  autoMuteMic: boolean;
  autoAdjustMicVolume: boolean;
  turnOffVideoOnJoin: boolean;
  showParticipantNames: boolean;
  enableHdVideo: boolean;
  meetingReminders: boolean;
  meetingInvitations: boolean;
  inMeetingNotifications: boolean;
  emailInvitations: boolean;
  emailReminders: boolean;
  reminderMinutes: string;
  selectedAudioInput: string;
  selectedAudioOutput: string;
  selectedVideoInput: string;
}

export const DEFAULT_SETTINGS: UserSettings = {
  language: 'en',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  theme: 'light',
  showAnimations: true,
  requirePasscodeForPersonal: true,
  enableWaitingRoom: false,
  autoMuteMic: true,
  autoAdjustMicVolume: true,
  turnOffVideoOnJoin: true,
  showParticipantNames: true,
  enableHdVideo: true,
  meetingReminders: true,
  meetingInvitations: true,
  inMeetingNotifications: true,
  emailInvitations: true,
  emailReminders: true,
  reminderMinutes: '15',
  selectedAudioInput: 'default',
  selectedAudioOutput: 'default',
  selectedVideoInput: 'default',
};

export const fetchUserSettings = async (): Promise<UserSettings> => {
  if (!auth.currentUser) return DEFAULT_SETTINGS;
  const snap = await getDoc(doc(db, 'userSettings', auth.currentUser.uid));
  if (!snap.exists()) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...snap.data() } as UserSettings;
};

export const saveUserSettings = async (settings: Partial<UserSettings>): Promise<void> => {
  if (!auth.currentUser) throw new Error('Not logged in');
  await setDoc(
    doc(db, 'userSettings', auth.currentUser.uid),
    { ...settings, updatedAt: serverTimestamp() },
    { merge: true }
  );
};
