import { create } from 'zustand';
import { Meeting, Participant, ChatMessage, MediaDevice, Notification } from '../types';

interface MeetingState {
  currentMeeting: Meeting | null;
  participants: Participant[];
  messages: ChatMessage[];
  isParticipantsListOpen: boolean; 
  isSettingsOpen: boolean;
  selectedLayout: 'grid' | 'focus' | 'presentation';
  devices: MediaDevice[];
  selectedAudioInput: string;
  selectedAudioOutput: string;
  selectedVideoInput: string;
  isAudioMuted: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  notifications: Notification[];
  toggleParticipantsList: () => void;
  toggleSettings: () => void;
  setLayout: (layout: 'grid' | 'focus' | 'presentation') => void;
  setAudioInput: (deviceId: string) => void;
  setAudioOutput: (deviceId: string) => void;
  setVideoInput: (deviceId: string) => void;
  fetchDevices: () => Promise<void>;
  clearNotification: (id: string) => void;
  clearMeeting: () => void;
}

interface MediaActions {
  toggleAudio: () => void;
  toggleVideo: () => void;
  toggleScreenShare: () => void;
  setAudioMuted: (muted: boolean) => void;
  setVideoEnabled: (enabled: boolean) => void;
  setScreenSharing: (sharing: boolean) => void;
  onToggleAudio: ((muted: boolean) => void) | null;
  onToggleVideo: ((enabled: boolean) => void) | null;
  onToggleScreenShare: ((sharing: boolean) => void) | null;
  setCallbacks: (cbs: {
    onToggleAudio: (muted: boolean) => void;
    onToggleVideo: (enabled: boolean) => void;
    onToggleScreenShare: (sharing: boolean) => void;
  }) => void;
}

interface ChatState {
  chatMessages: ChatMessage[];
  unreadMessageCount: number;
  isChatOpen: boolean;
}

interface ChatActions {
  receiveMessage: (msg: ChatMessage) => void;
  sendChatMessage: (text: string) => void;
  onSendChatMessage: ((text: string) => void) | null;
  setSendChatCallback: (cb: (text: string) => void) => void;
  clearUnreadMessages: () => void;
  setChatOpen: (open: boolean) => void;
}

type StoreState = MeetingState & MediaActions & ChatState & ChatActions;

const INITIAL_STATE = {
  currentMeeting: null,
  participants: [],
  messages: [],
  isParticipantsListOpen: false,
  isSettingsOpen: false,
  isScreenSharing: false,
  selectedLayout: 'grid' as const,
  chatMessages: [],
  unreadMessageCount: 0,
  isChatOpen: false,
  onSendChatMessage: null,
  devices: [],
  selectedAudioInput: 'default',
  selectedAudioOutput: 'default',
  selectedVideoInput: 'default',
  isAudioMuted: false,
  isVideoEnabled: true,
  notifications: [],
  onToggleAudio: null,
  onToggleVideo: null,
  onToggleScreenShare: null,
};

export const useNewMeetingStore = create<StoreState>((set, get) => ({
  ...INITIAL_STATE,

  setAudioMuted: (muted) => set({ isAudioMuted: muted }),
  setVideoEnabled: (enabled) => set({ isVideoEnabled: enabled }),
  setScreenSharing: (sharing) => set({ isScreenSharing: sharing }),

  toggleParticipantsList: () =>
    set((state) => ({ isParticipantsListOpen: !state.isParticipantsListOpen })),

  setCallbacks: (cbs) => set({ ...cbs }),

  toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),

  toggleScreenShare: () => {
    const { isScreenSharing, onToggleScreenShare } = get();
    const next = !isScreenSharing;
    set({ isScreenSharing: next });
    onToggleScreenShare?.(next);
  },

  toggleAudio: () => {
    const { isAudioMuted, onToggleAudio } = get();
    const next = !isAudioMuted;
    set({ isAudioMuted: next });
    onToggleAudio?.(next);
  },

  toggleVideo: () => {
    const { isVideoEnabled, onToggleVideo } = get();
    const next = !isVideoEnabled;
    set({ isVideoEnabled: next });
    onToggleVideo?.(next);
  },

  setLayout: (layout) => set({ selectedLayout: layout }),
  setAudioInput: (deviceId) => set({ selectedAudioInput: deviceId }),
  setAudioOutput: (deviceId) => set({ selectedAudioOutput: deviceId }),
  setVideoInput: (deviceId) => set({ selectedVideoInput: deviceId }),

  fetchDevices: async () => {
    try {
      const rawDevices = await navigator.mediaDevices.enumerateDevices();
      const devices: MediaDevice[] = rawDevices
        .filter((d) => d.kind !== 'audiooutput' || d.deviceId)
        .map((d) => ({
          deviceId: d.deviceId,
          kind: d.kind as MediaDevice['kind'],
          label: d.label || `${d.kind} (${d.deviceId.slice(0, 6)})`,
        }));
      set({ devices });
    } catch (error) {
      console.error('Failed to enumerate devices:', error);
    }
  },

  clearNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  setSendChatCallback: (cb) => set({ onSendChatMessage: cb }),

  sendChatMessage: (text: string) => {
    const { onSendChatMessage } = get();
    onSendChatMessage?.(text);
  },

  receiveMessage: (msg: ChatMessage) => {
    const { isChatOpen } = get();
    set((state) => ({
      chatMessages: [...state.chatMessages, msg],
      unreadMessageCount: isChatOpen
        ? state.unreadMessageCount
        : state.unreadMessageCount + 1,
    }));
  },

  clearUnreadMessages: () => set({ unreadMessageCount: 0 }),

  setChatOpen: (open: boolean) => {
    set({ isChatOpen: open });
    if (open) set({ unreadMessageCount: 0 });
  },

  clearMeeting: () => set(INITIAL_STATE),
}));
