/**
 * ChatPanel.tsx
 *
 * Real-time in-meeting chat panel.
 * Messages flow via socket.io — no persistence, ephemeral per session.
 *
 * Features:
 *  - Send/receive text messages
 *  - Sender name + timestamp on every message
 *  - Own messages right-aligned, others left-aligned
 *  - Emoji picker (native browser emoji keyboard via input type tricks +
 *    a lightweight custom grid for quick access)
 *  - Auto-scroll to latest message
 *  - Unread badge clears when panel opens
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  KeyboardEvent,
} from "react";
import {
  Box,
  IconButton,
  InputBase,
  Typography,
  Tooltip,
} from "@mui/material";
import { X, Send, Smile } from "lucide-react";
import { useNewMeetingStore } from "../../store/newMeetingStore";
import useAuthStore from "../../store/authStore";

// ── Quick-access emoji set ────────────────────────────────────────────────────
const QUICK_EMOJIS = [
  "😀","😂","😍","🤔","😮","😢","😡","👍","👎","👋",
  "🎉","🔥","❤️","💯","✅","🙏","😎","🤣","😅","🥳",
  "👏","💪","🚀","⭐","💡","🤝","😬","🙄","😴","🤦",
];

interface ChatPanelProps {
  onClose: () => void;
  isOpen: boolean;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ onClose, isOpen }) => {
  const messages = useNewMeetingStore((s) => s.chatMessages);
  const clearUnread = useNewMeetingStore((s) => s.clearUnreadMessages);
  const sendMessage = useNewMeetingStore((s) => s.sendChatMessage);
  const tempUser = useAuthStore((s) => s.tempUser);

  const [text, setText] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Clear unread count when panel opens
  useEffect(() => {
    if (isOpen) {
      clearUnread();
      inputRef.current?.focus();
    }
  }, [isOpen, clearUnread]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || !tempUser) return;
    sendMessage(trimmed);
    setText("");
    setEmojiOpen(false);
    inputRef.current?.focus();
  }, [text, sendMessage, tempUser]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const addEmoji = (emoji: string) => {
    setText((t) => t + emoji);
    inputRef.current?.focus();
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        bgcolor: "#0f172a",
        fontFamily: "'Sora', sans-serif",
      }}
    >
      {/* ── Header ── */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1.5,
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}
      >
        <Typography
          sx={{
            fontFamily: "'Sora', sans-serif",
            fontWeight: 700,
            fontSize: "0.95rem",
            color: "#e2e8f0",
            letterSpacing: "-0.01em",
          }}
        >
          Chat
        </Typography>
        <IconButton
          size="small"
          onClick={onClose}
          sx={{ color: "#64748b", "&:hover": { color: "#e2e8f0" } }}
        >
          <X size={18} />
        </IconButton>
      </Box>

      {/* ── Message list ── */}
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          px: 2,
          py: 1.5,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          // Custom scrollbar
          "&::-webkit-scrollbar": { width: 4 },
          "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
          "&::-webkit-scrollbar-thumb": {
            bgcolor: "rgba(255,255,255,0.1)",
            borderRadius: 2,
          },
        }}
      >
        {messages.length === 0 && (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              opacity: 0.4,
              mt: 8,
            }}
          >
            <Typography sx={{ fontSize: "2rem" }}>💬</Typography>
            <Typography
              sx={{
                color: "#94a3b8",
                fontSize: "0.8rem",
                fontFamily: "'Sora', sans-serif",
              }}
            >
              No messages yet
            </Typography>
          </Box>
        )}

        {messages.map((msg) => {
          const isOwn = msg.senderId === tempUser?.id;
          return (
            <Box
              key={msg.id}
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: isOwn ? "flex-end" : "flex-start",
              }}
            >
              {/* Sender + time */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  mb: 0.4,
                  flexDirection: isOwn ? "row-reverse" : "row",
                }}
              >
                <Typography
                  sx={{
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    color: isOwn ? "#6ee7b7" : "#94a3b8",
                    fontFamily: "'Sora', sans-serif",
                  }}
                >
                  {isOwn ? "You" : msg.senderName}
                </Typography>
                <Typography
                  sx={{
                    fontSize: "0.65rem",
                    color: "#475569",
                    fontFamily: "monospace",
                  }}
                >
                  {formatTime(msg.timestamp)}
                </Typography>
              </Box>

              {/* Bubble */}
              <Box
                sx={{
                  maxWidth: "78%",
                  px: 1.5,
                  py: 1,
                  borderRadius: isOwn
                    ? "16px 16px 4px 16px"
                    : "16px 16px 16px 4px",
                  bgcolor: isOwn
                    ? "rgba(110,231,183,0.15)"
                    : "rgba(255,255,255,0.07)",
                  border: isOwn
                    ? "1px solid rgba(110,231,183,0.2)"
                    : "1px solid rgba(255,255,255,0.06)",
                  wordBreak: "break-word",
                }}
              >
                <Typography
                  sx={{
                    fontSize: "0.85rem",
                    color: "#e2e8f0",
                    lineHeight: 1.5,
                    fontFamily: "'Sora', sans-serif",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {msg.content}
                </Typography>
              </Box>
            </Box>
          );
        })}

        <div ref={bottomRef} />
      </Box>

      {/* ── Emoji picker ── */}
      {emojiOpen && (
        <Box
          sx={{
            mx: 2,
            mb: 1,
            p: 1.5,
            bgcolor: "rgba(15,23,42,0.98)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 2,
            display: "grid",
            gridTemplateColumns: "repeat(10, 1fr)",
            gap: 0.5,
            flexShrink: 0,
          }}
        >
          {QUICK_EMOJIS.map((emoji) => (
            <Box
              key={emoji}
              onClick={() => addEmoji(emoji)}
              sx={{
                fontSize: "1.2rem",
                cursor: "pointer",
                textAlign: "center",
                lineHeight: "32px",
                borderRadius: 1,
                transition: "background 0.15s",
                "&:hover": { bgcolor: "rgba(255,255,255,0.1)" },
                userSelect: "none",
              }}
            >
              {emoji}
            </Box>
          ))}
        </Box>
      )}

      {/* ── Input bar ── */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 1.5,
          py: 1.25,
          borderTop: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}
      >
        <Tooltip title="Emoji" arrow>
          <IconButton
            size="small"
            onClick={() => setEmojiOpen((v) => !v)}
            sx={{
              color: emojiOpen ? "#6ee7b7" : "#64748b",
              "&:hover": { color: "#6ee7b7" },
              transition: "color 0.2s",
            }}
          >
            <Smile size={18} />
          </IconButton>
        </Tooltip>

        <Box
          sx={{
            flex: 1,
            bgcolor: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            px: 1.5,
            py: 0.75,
            display: "flex",
            alignItems: "center",
            transition: "border-color 0.2s",
            "&:focus-within": {
              borderColor: "rgba(110,231,183,0.4)",
            },
          }}
        >
          <InputBase
            inputRef={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message…"
            multiline
            maxRows={4}
            fullWidth
            sx={{
              color: "#e2e8f0",
              fontSize: "0.85rem",
              fontFamily: "'Sora', sans-serif",
              "& .MuiInputBase-input::placeholder": {
                color: "#475569",
                opacity: 1,
              },
            }}
          />
        </Box>

        <Tooltip title="Send (Enter)" arrow>
          <span>
            <IconButton
              size="small"
              onClick={handleSend}
              disabled={!text.trim()}
              sx={{
                color: text.trim() ? "#6ee7b7" : "#334155",
                bgcolor: text.trim()
                  ? "rgba(110,231,183,0.12)"
                  : "transparent",
                border: "1px solid",
                borderColor: text.trim()
                  ? "rgba(110,231,183,0.2)"
                  : "transparent",
                borderRadius: "50%",
                width: 34,
                height: 34,
                transition: "all 0.2s",
                "&:hover": {
                  bgcolor: text.trim()
                    ? "rgba(110,231,183,0.22)"
                    : "transparent",
                },
              }}
            >
              <Send size={15} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
};

export default ChatPanel;