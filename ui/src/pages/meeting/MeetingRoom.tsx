/**
 * MeetingRoom.tsx
 *
 * Connects to the mediasoup server via Socket.IO, manages WebRTC transports,
 * producers, consumers, and the in-meeting chat.
 *
 * Key invariants:
 * - Socket is created exactly once per (roomId, tempUser) pair.
 * - `start` is stored in a ref to avoid it being a useEffect dependency.
 * - All media cleanup happens in the effect's cleanup function.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  useMediaQuery,
  useTheme,
  CircularProgress,
  Snackbar,
  Alert,
} from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import io, { Socket } from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';
import { ArrowLeft, Clock } from 'lucide-react';
import VideoGrid from '../../components/video/VideoGrid';
import MeetingControls from '../../components/meeting/MeetingControls';
import useMeetingStore from '../../store/meetingStore';
import useAuthStore from '../../store/authStore';
import { useAuth } from '../../hooks/useAuth';
import { useNewMeetingStore } from '../../store/newMeetingStore';
import { ChatMessage, Participant, User } from '../../types';
import { auth } from '../../lib/firebase';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';

interface TransportData {
  id: string;
  iceParameters: mediasoupClient.types.IceParameters;
  iceCandidates: mediasoupClient.types.IceCandidate[];
  dtlsParameters: mediasoupClient.types.DtlsParameters;
  iceServers?: RTCIceServer[];
  error?: string;
}

interface ConsumerData {
  id: string;
  producerId: string;
  kind: mediasoupClient.types.MediaKind;
  rtpParameters: mediasoupClient.types.RtpParameters;
  appData?: any;
  error?: string;
}

interface NewProducerData {
  producerId: string;
  kind: mediasoupClient.types.MediaKind;
  appData?: Record<string, any>;
}

const MeetingRoom: React.FC = () => {
  const { user } = useAuth();
  const tempUser = useAuthStore((s) => s.tempUser);
  const pps = useMeetingStore((s) => s.participants);
  const title = useMeetingStore((s) => s.title);
  const setPPs = useMeetingStore((s) => s.setParticipants);
  const setCallbacks = useNewMeetingStore((s) => s.setCallbacks);
  const receiveMessage = useNewMeetingStore((s) => s.receiveMessage);
  const clearMeetingSettings = useNewMeetingStore((s) => s.clearMeeting);
  const setSendChatCallback = useNewMeetingStore((s) => s.setSendChatCallback);
  const setTempUser = useAuthStore((s) => s.setTempUser);
  const unreadMessages = useNewMeetingStore((s) => s.unreadMessageCount);
  const setChatOpen = useNewMeetingStore((s) => s.setChatOpen);
  const isChatOpen = useNewMeetingStore((s) => s.isChatOpen);

  const {isAudioMuted, isVideoEnabled} = useNewMeetingStore()

  console.log({pps, isAudioMuted, isVideoEnabled, isChatOpen})
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const socketRef = useRef<typeof Socket | null>(null);
  const deviceRef = useRef<mediasoupClient.Device | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const audioProducerRef = useRef<mediasoupClient.types.Producer | null>(null);
  const videoProducerRef = useRef<mediasoupClient.types.Producer | null>(null);
  const consumerMapRef = useRef<Map<string, mediasoupClient.types.Consumer>>(new Map());
  const peerProducersRef = useRef<Map<string, Set<string>>>(new Map());
  const didInitRef = useRef(false);

  const [streams, setStreams] = useState<{ [peerId: string]: MediaStream }>({});
  const [elapsedTime, setElapsedTime] = useState(0);
  const [connectError, setConnectError] = useState('');

  useEffect(() => {
    const id = setInterval(() => setElapsedTime((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!tempUser) {
      const id = user?.id || sessionStorage.getItem('guestUserId');
      if (!id) return;
      setTempUser({
        id,
        name:
          user?.name ||
          (user as any)?.email?.split('@')[0] ||
          sessionStorage.getItem('guestFullname') ||
          'Guest',
      } as User);
    }
  }, [user]);

  const formatElapsedTime = () => {
    const h = Math.floor(elapsedTime / 3600);
    const m = Math.floor((elapsedTime % 3600) / 60);
    const s = elapsedTime % 60;
    return `${h > 0 ? `${h}:` : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const leaveMeeting = useCallback(() => {
    setPPs([]);
    clearMeetingSettings();
    navigate('/');
  }, [navigate, setPPs, clearMeetingSettings]);

  const upsertTrack = useCallback((peerId: string, track: MediaStreamTrack) => {
    setStreams((prev) => {
      const existing = prev[peerId];
      if (existing) {
        if (track.kind === 'video') {
          existing.getVideoTracks().forEach((t) => { existing.removeTrack(t); t.stop(); });
        } else {
          existing.getAudioTracks().forEach((t) => { existing.removeTrack(t); t.stop(); });
        }
        existing.addTrack(track);
        return { ...prev, [peerId]: existing };
      }
      const stream = new MediaStream([track]);
      return { ...prev, [peerId]: stream };
    });
  }, []);

  const handleToggleAudio = useCallback(
    (enabled: boolean) => {
      const p = audioProducerRef.current;
      if (!p) return;
      if (!enabled) {
        p.pause();
        socketRef.current?.emit('pauseProducer', { roomId, producerId: p.id });
      } else {
        p.resume();
        socketRef.current?.emit('resumeProducer', { roomId, producerId: p.id });
      }
    },
    [roomId]
  );

  const handleToggleVideo = useCallback(
    (enabled: boolean) => {
      const p = videoProducerRef.current;
      if (!p) return;
      if (!enabled) {
        p.pause();
        socketRef.current?.emit('pauseProducer', { roomId, producerId: p.id });
      } else {
        p.resume();
        socketRef.current?.emit('resumeProducer', { roomId, producerId: p.id });
      }
    },
    [roomId]
  );

  const handleToggleScreenShare = useCallback(
    async (sharing: boolean) => {
      const p = videoProducerRef.current;
      if (!p || !tempUser) return;

      const restoreCam = async () => {
        const screenStream = screenStreamRef.current;
        screenStreamRef.current = null;
        screenStream?.getTracks().forEach((t) => t.stop());
        const freshStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const freshTrack = freshStream.getVideoTracks()[0];
        if (localStreamRef.current) {
          localStreamRef.current.getVideoTracks().forEach((t) => {
            localStreamRef.current!.removeTrack(t);
            t.stop();
          });
          localStreamRef.current.addTrack(freshTrack);
        }
        if (videoProducerRef.current) await videoProducerRef.current.replaceTrack({ track: freshTrack });
        upsertTrack(tempUser.id, freshTrack);
      };

      if (sharing) {
        try {
          const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
          screenStreamRef.current = screenStream;
          const screenTrack = screenStream.getVideoTracks()[0];
          screenTrack.onended = async () => {
            useNewMeetingStore.getState().setScreenSharing(false);
            await restoreCam();
          };
          await p.replaceTrack({ track: screenTrack });
          upsertTrack(tempUser.id, screenTrack);
        } catch (err) {
          console.error('Screen share error:', err);
          useNewMeetingStore.getState().setScreenSharing(false);
        }
      } else {
        await restoreCam();
      }
    },
    [tempUser, upsertTrack]
  );

  useEffect(() => {
    setCallbacks({
      onToggleAudio: handleToggleAudio,
      onToggleVideo: handleToggleVideo,
      onToggleScreenShare: handleToggleScreenShare,
    });
  }, [handleToggleAudio, handleToggleVideo, handleToggleScreenShare, setCallbacks]);

  const start = useCallback(async () => {
    if (!socketRef.current || !deviceRef.current || !tempUser) return;

    const socket = socketRef.current;
    const device = deviceRef.current;
    const myPeerId = tempUser.id;

    socket.removeEventListener('newProducer');
    socket.removeEventListener('peerLeft');
    socket.removeEventListener('peerJoined');
    socket.removeEventListener('consumerClosed');
    socket.removeEventListener('producerClosed');
    socket.removeEventListener('chatMessage');

    let recvTransport: mediasoupClient.types.Transport | null = null;
    let recvTransportId: string | null = null;
    let recvTransportCreating: Promise<void> | null = null;

    function ensureRecvTransport(): Promise<void> {
      if (recvTransport) return Promise.resolve();
      if (recvTransportCreating) return recvTransportCreating;
      recvTransportCreating = new Promise<void>((resolve, reject) => {
        socket.emit('createWebRtcTransport', { roomId, direction: 'recv' }, (params: TransportData) => {
          if (params.error) return reject(new Error(params.error));
          recvTransportId = params.id;
          const t = device.createRecvTransport({
            id: params.id,
            iceParameters: params.iceParameters,
            iceCandidates: params.iceCandidates,
            dtlsParameters: params.dtlsParameters,
            iceServers: params.iceServers ?? [],
          });
          t.on('connect', ({ dtlsParameters: dp }, cb, errback) => {
            socket.emit('connectTransport', { roomId, transportId: params.id, dtlsParameters: dp },
              (res: any) => (res.error ? errback(new Error(res.error)) : cb()));
          });
          recvTransport = t;
          resolve();
        });
      });
      return recvTransportCreating;
    }

    async function consume(producerId: string, kind: string, peerId: string): Promise<void> {
      if (!recvTransport || !recvTransportId) return;
      return new Promise<void>((resolve) => {
        socket.emit('consume', {
          roomId,
          consumerTransportId: recvTransportId,
          producerId,
          clientRtpCapabilities: device.rtpCapabilities,
        }, async (params: ConsumerData) => {
          if (params.error) return resolve();
          const consumer = await recvTransport!.consume({
            id: params.id,
            producerId: params.producerId,
            kind: params.kind,
            rtpParameters: params.rtpParameters,
          });
          consumerMapRef.current.set(producerId, consumer);
          if (!peerProducersRef.current.has(peerId)) peerProducersRef.current.set(peerId, new Set());
          peerProducersRef.current.get(peerId)!.add(producerId);
          socket.emit('consumerResume', { roomId, consumerId: consumer.id }, async (res: any) => {
            if (res.error) return resolve();
            await consumer.resume();
            if (kind === 'video') {
              setTimeout(() => socket.emit('requestKeyFrame', { roomId, consumerId: consumer.id }), 150);
            }
            upsertTrack(peerId, consumer.track);
            consumer.track.onunmute = () => upsertTrack(peerId, consumer.track);
            resolve();
          });
        });
      });
    }

    socket.on('newProducer', async ({ producerId, kind, appData: ad }: NewProducerData) => {
      const peerId: string = ad?.peerId ?? 'unknown';
      if (peerId === myPeerId) return;
      await ensureRecvTransport();
      await consume(producerId, kind, peerId);
    });

    socket.on('peerJoined', ({ peerId, peerUserName }: { peerId: string; peerUserName: string }) => {
      if (peerId) setPPs((prev) => [...prev, { id: peerId, name: peerUserName ?? 'Guest' }]);
    });

    socket.on('peerLeft', ({ peerId, producerIds }: { peerId: string; producerIds: string[] }) => {
      if (peerId === myPeerId) return;
      const tracked = peerProducersRef.current.get(peerId);
      const toClose = tracked ? [...tracked] : (producerIds ?? []);
      toClose.forEach((pid) => { consumerMapRef.current.get(pid)?.close(); consumerMapRef.current.delete(pid); });
      peerProducersRef.current.delete(peerId);
      setStreams((prev) => { const next = { ...prev }; delete next[peerId]; return next; });
      setPPs((prev: Participant[]) => prev.filter((p: Participant) => p.id !== peerId));
    });

    socket.on('consumerClosed', ({ producerId }: { producerId: string }) => {
      consumerMapRef.current.get(producerId)?.close();
      consumerMapRef.current.delete(producerId);
    });

    socket.on('producerClosed', ({ producerId }: { producerId: string }) => {
      consumerMapRef.current.get(producerId)?.close();
      consumerMapRef.current.delete(producerId);
    });

    socket.on('chatMessage', (msg: ChatMessage) => receiveMessage(msg));

    setSendChatCallback((text: string) => {
      if (!text.trim()) return;
      const msg: ChatMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        senderId: myPeerId,
        senderName: tempUser.name,
        content: text.trim(),
        timestamp: Date.now(),
        isPrivate: false,
      };
      receiveMessage(msg);
      socket.emit('sendMessage', { roomId, message: msg });
    });

    // Local media
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, frameRate: 30 },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      localStreamRef.current = stream;
      setStreams((prev) => ({ ...prev, [myPeerId]: stream }));
    } catch (err) {
      console.error('[start] getUserMedia error:', err);
    }

    // Send transport + produce
    try {
      await new Promise<void>((resolveSendTransport) => {
        socket.emit('createWebRtcTransport', { roomId, direction: 'send' }, async (params: TransportData) => {
          if (params.error) return resolveSendTransport();
          const sendTransportId = params.id;
          const t = device.createSendTransport({
            id: params.id,
            iceParameters: params.iceParameters,
            iceCandidates: params.iceCandidates,
            dtlsParameters: params.dtlsParameters,
            iceServers: params.iceServers ?? [],
          });
          t.on('connect', ({ dtlsParameters: dp }, cb, errback) => {
            socket.emit('connectTransport', { roomId, transportId: sendTransportId, dtlsParameters: dp },
              (res: any) => (res.error ? errback(new Error(res.error)) : cb()));
          });
          t.on('produce', ({ kind, rtpParameters, appData: ad }, cb, errback) => {
            socket.emit('produce', {
              roomId, transportId: sendTransportId, kind, rtpParameters,
              appData: { ...ad, peerId: myPeerId },
            }, (res: any) => (res.error ? errback(new Error(res.error)) : cb({ id: res.id })));
          });
          if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            const videoTrack = localStreamRef.current.getVideoTracks()[0];

            // if (audioTrack) {
            //   audioTrack.enabled = !isAudioMuted
            // }
            // if (videoTrack) {
            //   videoTrack.enabled = isVideoEnabled
            // }
            if (audioTrack) {
              try { 
                audioProducerRef.current = await t.produce({ track: audioTrack }); 
                if (isAudioMuted) {
                  audioProducerRef.current.pause();
                  socket.emit('pauseProducer', {
                    roomId,
                    producerId: audioProducerRef.current.id
                  })
                }
              }
              catch (e) { console.error('[produce] audio failed:', e); }
            }
            if (videoTrack) {
              try {
                videoProducerRef.current = await t.produce({
                  track: videoTrack,
                  encodings: [
                    { maxBitrate: 100_000, scaleResolutionDownBy: 4 },
                    { maxBitrate: 300_000, scaleResolutionDownBy: 2 },
                    { maxBitrate: 900_000 },
                  ],
                  codecOptions: { videoGoogleStartBitrate: 1000 },
                });

                if (!isVideoEnabled) {
                  videoProducerRef.current.pause();
                  socket.emit('pauseProducer', {
                    roomId,
                    producerId: videoProducerRef.current.id
                  })
                }
              } catch (e) { console.error('[produce] video failed:', e); }
            }
          }
          resolveSendTransport();
        });
      });

      socket.emit('getProducers', { roomId, clientRtpCapabilities: device.rtpCapabilities },
        (res: any) => { if (res?.error) console.error('[getProducers] error:', res.error); });
    } catch (error) {
      console.error('[start] fatal error:', error);
      leaveMeeting();
    }
  }, [roomId, tempUser, upsertTrack, leaveMeeting]);

  const startRef = useRef(start);
  useEffect(() => { startRef.current = start; }, [start]);

  useEffect(() => {
    if (!roomId || !tempUser) return;
    if (didInitRef.current) return;
    didInitRef.current = true;

    let cancelled = false;

    (async () => {
      try {
        const token = auth.currentUser
          ? await auth.currentUser.getIdToken(true).catch(() => '')
          : '';

        if (cancelled) return;

        const socket = io(SERVER_URL, {
          reconnection: true,
          reconnectionAttempts: 5,
          auth: { token },
          withCredentials: true,
        } as any);
        socketRef.current = socket;
        deviceRef.current = new mediasoupClient.Device();

        socket.on('connect', () => {
          console.log('[socket] connected id=', socket.id);
          socket.emit(
            'joinRoom',
            { roomId, rtpCapabilities: null, appUserId: tempUser.id, appUserName: tempUser.name },
            async (res: { rtpCapabilities: any; peers: any; error: any }) => {
              try {
                if (res.error) {
                  setConnectError(res.error);
                  setTimeout(() => leaveMeeting(), 2500);
                  return;
                }
                setPPs(res.peers ?? []);
                await deviceRef.current!.load({ routerRtpCapabilities: res.rtpCapabilities });
                await startRef.current();
              } catch (e: any) {
                console.error('[device/start] error:', e);
                setConnectError(e.message || 'Connection failed');
                setTimeout(() => leaveMeeting(), 2500);
              }
            }
          );
        });

        socket.on('connect_error', (e: Error) => {
          console.error('[socket] connect_error:', e.message);
          setConnectError('Failed to connect to server. Returning to home…');
          setTimeout(() => leaveMeeting(), 2500);
        });
      } catch (error) {
        console.error('[socket bootstrap]', error);
      }
    })();

    return () => {
      cancelled = true;
      didInitRef.current = false;
      socketRef.current?.disconnect();
      socketRef.current = null;
      deviceRef.current = null;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [roomId, tempUser]);

  const screenShareParticipant = useMemo(() => {
    return pps?.find((p) => {
      const stream = streams[p.id];
      if (!stream) return false;
      const track = stream.getVideoTracks()[0];
      if (!track) return false;
      return !!track.getSettings().displaySurface;
    });
  }, [pps, streams]);

  return (
    <Box sx={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden', bgcolor: '#0a0a0f', flexDirection: 'column' }}>
      <AppBar
        position="static"
        elevation={0}
        sx={{ bgcolor: 'rgba(15,15,25,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}
      >
        <Toolbar sx={{ gap: 1 }}>
          <IconButton edge="start" onClick={() => leaveMeeting()} sx={{ color: '#94a3b8', '&:hover': { color: '#fff' } }}>
            <ArrowLeft size={20} />
          </IconButton>
          <Typography
            variant="h6"
            sx={{ flexGrow: 1, fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: '1rem', color: '#e2e8f0', letterSpacing: '-0.01em' }}
          >
            {title || 'Meeting'}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2, px: 1.5, py: 0.5 }}>
            <Clock size={14} color="#6ee7b7" />
            <Typography variant="body2" sx={{ color: '#6ee7b7', fontFamily: 'monospace', fontSize: '0.8rem', letterSpacing: '0.05em' }}>
              {formatElapsedTime()}
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <VideoGrid
          participants={pps}
          layout={screenShareParticipant ? 'presentation' : 'grid'}
          screenShareParticipantId={screenShareParticipant?.id}
          streams={streams}
        />
      </Box>

      <MeetingControls
        onLeave={() => leaveMeeting()}
        onToggleChat={() => setChatOpen(!isChatOpen)}
        onToggleParticipants={() => {}}
        unreadMessages={unreadMessages}
      />

      <Snackbar open={!!connectError} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity="error" sx={{ width: '100%' }}>
          {connectError}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default MeetingRoom;
