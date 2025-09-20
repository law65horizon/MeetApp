import { create } from "zustand";
import { Participant } from "../types";
import { createMeeting, joinMeeting } from "../lib/firebase";
import useAuthStore from "./authStore";

interface MeetingState {
  participants: Participant[];
  setParticipants: (participants: Participant[] | ((prev: Participant[]) =>Participant[])) => void;
  create: (
    isPrivate: boolean,
    passcode: any,
    recipients?: string[],
    description?: string,
    title?: string,
    rules?: any
  ) => Promise<any>;
  join: (
    meetingId: string,
    passcode: string,
    fullname: string | undefined
  ) => Promise<any>;
  title: string | null;
  setTitle: (title: string) => void;
}

const useMeetingStore = create<MeetingState>((set) => ({
  participants: [],
  title: null,
  setTitle: (title) => set({ title }),
  setParticipants: (participants) => set((state) => ({
    participants: 
      typeof participants === 'function'
        ? participants(state.participants)
        : participants,
  })),

  create: async (isPrivate, passcode, recipients, description, title, rules) => {
    const meetingData: any = await createMeeting(
      isPrivate,
      passcode,
      recipients,
      description,
      title,
      rules
    );
    const participants = meetingData.participants;
    console.log({participants})
    const meetingTitle = meetingData.title;
    set({ title: meetingTitle });
    // set({ participants, title: meetingTitle });

    // Ensure tempUser reflects the host's identity
    // (host is always a logged-in Firebase user so auth.currentUser.uid is correct)
    const { tempUser, setTempUser } = useAuthStore.getState();
    if (!tempUser && participants[0]) {
      setTempUser(participants[0]);
    }
    document.cookie = `passcode=${passcode}; path=/; SameSite=Lax; Secure`
    return { meetingId: meetingData.meetingId, participants };
  },

  join: async (meetingId, passcode, fullname) => {
    const meetingData: any = await joinMeeting(
      meetingId.trim(),
      passcode.trim(),
      fullname
    );
    console.log('joining meeting')
    // const participants = meetingData.participants_data;
    const title = meetingData.title;
    set({ title });
    // set({ participants, title });

    // ── Critical: ensure tempUser.id matches participant.id ──────────────────
    // currentParticipant.id is the stable ID written to Firestore by joinMeeting.
    // We must set tempUser to this so appData.peerId in App.tsx matches.
    if (meetingData.currentParticipant) {
      const { setTempUser } = useAuthStore.getState();
      setTempUser(meetingData.currentParticipant);
      console.log(
        "[meetingStore] tempUser set to:",
        meetingData.currentParticipant
      );
    }

    document.cookie = `passcode=${passcode}; path=/; SameSite=Lax; Secure`
    console.log({passcode})
    return meetingData;
  },
}));

export default useMeetingStore;