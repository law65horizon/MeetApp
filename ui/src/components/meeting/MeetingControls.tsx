/**
 * MeetingControls.tsx
 *
 * Polished dark-glass control bar.
 * Reads state from useNewMeetingStore and fires the callbacks that
 * App.tsx wires in via setCallbacks().
 */
import { useState } from "react";
import {
  Box,
  IconButton,
  Tooltip,
  Button,
  useTheme,
  useMediaQuery,
  Badge,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Fade,
} from "@mui/material";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  MessageSquare,
  Users,
  Settings,
  ChevronUp,
} from "lucide-react";
import { useNewMeetingStore } from "../../store/newMeetingStore";
import DeviceSettings from "./DeviceSettings";
import ChatPanel from "../chat/ChatPanel";
import ParticipantsList from "./ParticipantsList";
import useMeetingStore from "../../store/meetingStore";

interface MeetingControlsProps {
  onLeave: () => void;
  onToggleChat: () => void;
  onToggleParticipants: () => void;
  unreadMessages: number;
}

// ── Shared icon button styling ────────────────────────────────────────────────
const ctrlBtn = (active: boolean, danger = false) => ({
  width: 44,
  height: 44,
  borderRadius: "50%",
  transition: "all 0.2s ease",
  bgcolor: danger
    ? "rgba(239,68,68,0.15)"
    : active
    ? "rgba(110,231,183,0.12)"
    : "rgba(255,255,255,0.07)",
  color: danger ? "#f87171" : active ? "#6ee7b7" : "#94a3b8",
  border: `1px solid ${
    danger
      ? "rgba(239,68,68,0.25)"
      : active
      ? "rgba(110,231,183,0.25)"
      : "rgba(255,255,255,0.08)"
  }`,
  "&:hover": {
    bgcolor: danger
      ? "rgba(239,68,68,0.25)"
      : active
      ? "rgba(110,231,183,0.2)"
      : "rgba(255,255,255,0.12)",
    transform: "scale(1.08)",
  },
  "&:active": { transform: "scale(0.95)" },
});

// ─────────────────────────────────────────────────────────────────────────────

const MeetingControls = ({
  onLeave,
  onToggleChat,
  onToggleParticipants,
  unreadMessages,
}: MeetingControlsProps) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [collapsed, setCollapsed] = useState(false);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // const [chatOpen, setChatOpen] = useState(false);
  const chatOpen = useNewMeetingStore((s) => s.isChatOpen)
  const setChatOpen = useNewMeetingStore((s) => s.setChatOpen)
  const [participantsOpen, setParticipantsOpen] = useState(false);

  const participants = useMeetingStore((s) => s.participants);

  const {
    isAudioMuted,
    isVideoEnabled,
    isScreenSharing,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
  } = useNewMeetingStore();

  const closeAll = () => {
    setSettingsOpen(false);
    setChatOpen(false);
    setParticipantsOpen(false);
  };

  return (
    <>
      {/* ── Control Bar ── */}
      <Box
        sx={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 20,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* Collapse toggle */}
        {!isMobile && (
          <IconButton
            size="small"
            onClick={() => setCollapsed((c) => !c)}
            sx={{
              mb: 0.5,
              width: 28,
              height: 16,
              borderRadius: "8px 8px 0 0",
              bgcolor: "rgba(15,15,25,0.85)",
              color: "#475569",
              border: "1px solid rgba(255,255,255,0.07)",
              borderBottom: "none",
              "&:hover": { color: "#94a3b8" },
            }}
          >
            <ChevronUp
              size={14}
              style={{
                transform: collapsed ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.3s ease",
              }}
            />
          </IconButton>
        )}

        <Fade in={!collapsed} unmountOnExit>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: { xs: 0.75, sm: 1 },
              px: { xs: 2, sm: 3 },
              py: { xs: 1.25, sm: 1.5 },
              mb: { xs: 0, sm: 1.5 },
              bgcolor: "rgba(15,15,25,0.88)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: isMobile ? "16px 16px 0 0" : 999,
              boxShadow: "0 -4px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)",
              flexWrap: isMobile ? "wrap" : "nowrap",
              justifyContent: "center",
              width: isMobile ? "100vw" : "auto",
              boxSizing: "border-box",
            }}
          >
            {/* Audio */}
            <Tooltip title={isAudioMuted ? "Unmute" : "Mute"} arrow>
              <IconButton onClick={toggleAudio} sx={ctrlBtn(!isAudioMuted, isAudioMuted)}>
                {isAudioMuted ? <MicOff size={18} /> : <Mic size={18} />}
              </IconButton>
            </Tooltip>

            {/* Video */}
            <Tooltip title={isVideoEnabled ? "Stop Video" : "Start Video"} arrow>
              <IconButton onClick={toggleVideo} sx={ctrlBtn(isVideoEnabled, !isVideoEnabled)}>
                {isVideoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
              </IconButton>
            </Tooltip>

            {/* Screen share */}
            <Tooltip title={isScreenSharing ? "Stop Sharing" : "Share Screen"} arrow>
              <IconButton onClick={toggleScreenShare} sx={ctrlBtn(isScreenSharing)}>
                {isScreenSharing ? <MonitorOff size={18} /> : <Monitor size={18} />}
              </IconButton>
            </Tooltip>

            {/* Participants */}
            <Tooltip title="Participants" arrow>
              <IconButton
                onClick={() => {
                  closeAll();
                  setParticipantsOpen((v) => !v);
                }}
                sx={ctrlBtn(participantsOpen)}
              >
                <Users size={18} />
              </IconButton>
            </Tooltip>

            {/* Chat */}
            <Tooltip title="Chat" arrow>
              <IconButton
                onClick={() => {
                  closeAll();
                  setChatOpen(!chatOpen);
                }}
                sx={ctrlBtn(chatOpen)}
              >
                <Badge badgeContent={unreadMessages} color="error" max={99}>
                  <MessageSquare size={18} />
                </Badge>
              </IconButton>
            </Tooltip>

            {/* Settings */}
            <Tooltip title="Settings" arrow>
              <IconButton
                onClick={() => {
                  closeAll();
                  setSettingsOpen((v) => !v);
                }}
                sx={ctrlBtn(settingsOpen)}
              >
                <Settings size={18} />
              </IconButton>
            </Tooltip>

            {/* Divider */}
            {/* <Box
              sx={{
                width: 1,
                height: 24,
                bgcolor: "rgba(255,255,255,0.1)",
                mx: 0.5,
                display: isMobile ? "none" : "block",
              }}
            /> */}

            {/* Leave */}
            <Button
              variant="contained"
              size="small"
              startIcon={<PhoneOff size={15} />}
              onClick={() => setConfirmLeaveOpen(true)}
              sx={{
                borderRadius: 999,
                bgcolor: "#ef4444",
                color: "#fff",
                fontWeight: 600,
                fontSize: "0.8rem",
                px: 2,
                py: 0.75,
                textTransform: "none",
                "&:hover": { bgcolor: "#dc2626" },
              }}
            >
              Leave
            </Button>
          </Box>
        </Fade>
      </Box>

      {/* ── Slide-in Panels ── */}
      {/* Settings */}
      <Dialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { bgcolor: "#111827", color: "#e2e8f0", borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontFamily: "'Sora', sans-serif", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          Device Settings
        </DialogTitle>
        <DialogContent>
          <DeviceSettings />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)} sx={{ color: "#6ee7b7" }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Chat */}
      <Dialog
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            position: "absolute",
            right: 0,
            top: 0,
            m: 0,
            height: "100%",
            maxHeight: "100%",
            borderRadius: "16px 0 0 16px",
            bgcolor: "#111827",
            color: "#e2e8f0",
          },
        }}
      >
        <DialogContent sx={{ p: 0, height: "100%" }}>
          
          <ChatPanel onClose={() => setChatOpen(false)} isOpen={chatOpen} />
        </DialogContent>
      </Dialog>

      {/* Participants */}
      <Dialog
        open={participantsOpen}
        onClose={() => setParticipantsOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            position: "absolute",
            right: 0,
            top: 0,
            m: 0,
            height: "100%",
            maxHeight: "100%",
            borderRadius: "16px 0 0 16px",
            bgcolor: "#111827",
            color: "#e2e8f0",
          },
        }}
      >
        <DialogContent sx={{ p: 0 }}>
          <ParticipantsList onClose={() => setParticipantsOpen(false)} participants={participants} />
        </DialogContent>
      </Dialog>

      {/* Leave Confirm */}
      <Dialog
        open={confirmLeaveOpen}
        onClose={() => setConfirmLeaveOpen(false)}
        PaperProps={{ sx: { bgcolor: "#111827", color: "#e2e8f0", borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontFamily: "'Sora', sans-serif" }}>Leave Meeting?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: "#94a3b8" }}>
            Are you sure you want to leave this meeting?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmLeaveOpen(false)} sx={{ color: "#94a3b8" }}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setConfirmLeaveOpen(false);
              onLeave();
            }}
            variant="contained"
            color="error"
            sx={{ borderRadius: 999 }}
          >
            Leave Meeting
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default MeetingControls;