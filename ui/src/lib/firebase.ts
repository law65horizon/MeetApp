import { initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  arrayUnion,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { nanoid } from "nanoid";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: "localhost:5173",
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID,
  measurementId: import.meta.env.VITE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth };

// ── Auth ──────────────────────────────────────────────────────────────────────

export const createUser = async (email: string, password: string) => {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
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

  const meetingData = {
    id: meetingId,
    hostId: auth.currentUser.uid,
    hostEmail: auth.currentUser.email,
    recipients: recipients??[],
    title: title ?? `Meeting with ${auth.currentUser.email?.split("@")[0]}`,
    status: "pending",
    createdAt: serverTimestamp(),
    scheduledFor: serverTimestamp(),
    participants: [auth.currentUser.uid],
    participants_data: [
      {
        id: auth.currentUser.uid,
        name: auth.currentUser.email?.split("@")[0],
      },
    ],
    isPrivate,
    passcode,
    description,
    rules
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

  console.log({status: meetingData.status})
  if (meetingData.status === "closed") throw new Error("Meeting over");

  if (meetingData.isPrivate && ![meetingData.hostId, ...meetingData.recipients].includes(auth.currentUser?.uid)) {
    throw new Error("You are not authorized to join this meeting");
  }

  // if (meetingData.passcode != meetingCode) {
  //   throw new Error("Invalid Meeting Code");
  // }

  // ── Determine stable user ID ──────────────────────────────────────────────
  // For logged-in users: Firebase Auth UID.
  // For guests: reuse an existing guest ID stored in sessionStorage, or
  //             generate a new nanoid. This ensures participant.id is stable
  //             across reconnects AND matches what tempUser.id will be set to.
  let userId: string;
  let displayName: string;

  if (auth.currentUser) {
    userId = auth.currentUser.uid;
    displayName = auth.currentUser.email?.split("@")[0] ?? "User";
  } else {
    // Reuse guest ID if we already have one for this session
    const stored = sessionStorage.getItem("guestUserId");
    userId = stored ?? nanoid();
    sessionStorage.setItem("guestUserId", userId);
    if (fullname) sessionStorage.setItem('guestFullname', fullname)
    displayName = fullname ?? "Guest";
  }

  // Add to participants if not already present
  const alreadyIn = meetingData.participants?.includes(userId);
  if (!alreadyIn) {
    await updateDoc(meetingRef, {
      participants: arrayUnion(userId),
      participants_data: arrayUnion({ id: userId, name: displayName }),
      status: "active",
      joinedAt: serverTimestamp(),
    });
    meetingData.participants_data = [
      ...(meetingData.participants_data ?? []),
      { id: userId, name: displayName },
    ];
  } else {
    await updateDoc(meetingRef, {
      participants_data: arrayUnion({ id: userId, name: displayName }),
      status: "active",
      joinedAt: serverTimestamp(),
    });
    meetingData.participants_data = [
      ...(meetingData.participants_data ?? []),
      { id: userId, name: displayName },
    ];
  }

  return {
    ...meetingData,
    // currentParticipant carries the stable ID back to the store
    currentParticipant: { id: userId, name: displayName },
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
      offer: null,
      answer: null,
      hostCandidates: [],
      recipientCandidates: [],
    });
  } catch (error: any) {
    throw new Error("Failed to end meeting: " + error.message);
  }
};

// export const onMeetingUpdate = (
//   meetingId: string,
//   callback: (data: any) => void
// ) => {
//   console.log("Setting up meeting listener:", meetingId);
//   const meetingRef = doc(db, "meetings", meetingId);

//   return onSnapshot(
//     meetingRef,
//     (snap: any) => {
//       if (!snap.exists()) {
//         console.log("Meeting document not found");
//         return;
//       }
//       const data = snap.data();
//       callback({
//         ...data,
//         createdAt: data.createdAt?.toDate(),
//         scheduledFor: data.scheduledFor?.toDate(),
//         joinedAt: data.joinedAt?.toDate(),
//         endedAt: data.endedAt?.toDate(),
//       });
//     },
//     (error: any) => {
//       console.error("Error in meeting listener:", error);
//     }
//   );
// };