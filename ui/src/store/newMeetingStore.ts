import { create } from 'zustand';
import { Meeting, Participant, ChatMessage, MediaDevice, Notification } from '../types';
import { useNewAuthStore } from './newAuthStore';

interface MeetingState {
  // Meeting data
  currentMeeting: Meeting | null;
  participants: Participant[];
  messages: ChatMessage[];
  
  // UI state
  isParticipantsListOpen: boolean;
  isSettingsOpen: boolean;
  selectedLayout: 'grid' | 'focus' | 'presentation';
  
  // Media state
  devices: MediaDevice[];
  selectedAudioInput: string;
  selectedAudioOutput: string;
  selectedVideoInput: string;
  isAudioMuted: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean,
  
  // Notifications
  notifications: Notification[];
  
  // Actions
  fetchMeeting: (id: string) => Promise<void>;
  toggleChat: () => void;
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
  // Callbacks injected by the meeting component
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
  setSendChatCallback : (cb: (text: string) => void) => void
  clearUnreadMessages: () => void;
  setChatOpen: (open: boolean) => void;
}

type StoreState = MeetingState & MediaActions & ChatState & ChatActions

export const useNewMeetingStore = create<StoreState>((set, get) => ({
  // Meeting data
  currentMeeting: null,
  participants: [],
  messages: [],
  
  // UI stat
  isParticipantsListOpen: false,
  isSettingsOpen: false,
  isScreenSharing: false,
  selectedLayout: 'grid',

  // Chat
  chatMessages: [],
  unreadMessageCount: 0,
  isChatOpen: false,
  onSendChatMessage: null,
  
  // Media state
  devices: [],
  selectedAudioInput: 'default',
  selectedAudioOutput: 'default',
  selectedVideoInput: 'default',
  isAudioMuted: false,
  isVideoEnabled: true,
  setAudioMuted: (muted) => set({ isAudioMuted: muted }),
  setVideoEnabled: (enabled) => set({ isVideoEnabled: enabled }),
  setScreenSharing: (sharing) => set({ isScreenSharing: sharing }),
  
  // Notifications
  notifications: [],
  
  // Actions
  fetchMeeting: async (id: string) => {
    try {
      // Fetch meeting data
      const meetingResponse = await fetch('/mock/meetings.json');
      const meetings: Meeting[] = await meetingResponse.json();
      const meeting = meetings.find(m => m.id === id) || null;
      
      // Fetch participants
      const participantsResponse = await fetch('/mock/participants.json');
      const allParticipants: Participant[] = await participantsResponse.json();
      
      // Filter participants for this meeting
      // const participants = meeting 
      //   ? allParticipants.filter(p => meeting.participants.includes(p.id))
      //   : [];

      const participants = allParticipants;
      
      // Fetch messages
      const messagesResponse = await fetch('/mock/messages.json');
      const messages: ChatMessage[] = await messagesResponse.json();
      
      set({ currentMeeting: meeting, participants, messages });
    } catch (error) {
      console.error('Failed to fetch meeting', error);
      // Add error notification
      const newNotification: Notification = {
        id: `notification-${Date.now()}`,
        type: 'error',
        message: 'Failed to load meeting data',
        timestamp: new Date().toISOString(),
        isRead: false
      };
      set(state => ({ 
        notifications: [...state.notifications, newNotification] 
      }));
    }
  },
  
  sendMessage: (message: string, isPrivate: boolean, recipientId?: string) => {
    const { user } = useNewAuthStore.getState();
    if (!user) return;
    
    const newMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      senderId: user.id,
      senderName: user.name,
      senderAvatar: user.avatar,
      content:message,
      timestamp: 0,
      isPrivate,
      recipientId
    };
    
    set(state => ({ messages: [...state.messages, newMessage] }));
  },
  
  toggleChat: () => set(state => ({ isChatOpen: !state.isChatOpen })),
  
  toggleParticipantsList: () => set(state => ({ 
    isParticipantsListOpen: !state.isParticipantsListOpen 
  })),

  setCallbacks: (cbs) => set({...cbs}),
  
  toggleSettings: () => set(state => ({ isSettingsOpen: !state.isSettingsOpen })),
  
  toggleScreenShare: () => {
    const { isScreenSharing, onToggleScreenShare } = get();
    const next = !isScreenSharing;
    set({ isScreenSharing: next });
    onToggleScreenShare?.(next);
  },

  onToggleAudio: null,
  onToggleVideo: null,
  onToggleScreenShare: null,
  
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
      const response = await fetch('/mock/devices.json');
      const devices: MediaDevice[] = await response.json();
      set({ devices });
    } catch (error) {
      console.error('Failed to fetch devices', error);
    }
  },
  
  clearNotification: (id) => {
    set(state => ({
      notifications: state.notifications.filter(n => n.id !== id)
    }));
  },

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

  clearMeeting: () => {
    set({
      currentMeeting: null,
      participants: [],
      messages: [],
      
      // UI stat
      isParticipantsListOpen: false,
      isSettingsOpen: false,
      isScreenSharing: false,
      selectedLayout: 'grid',

      // Chat
      chatMessages: [],
      unreadMessageCount: 0,
      isChatOpen: false,
      onSendChatMessage: null,
      
      // Media state
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
    })
  }
}));