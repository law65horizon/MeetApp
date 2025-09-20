import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Typography,
  Alert,
} from '@mui/material';
import { X } from 'lucide-react';
import { useState } from 'react';
import useMeetingStore from '../../store/meetingStore';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';

interface DialogProps {
  joinDialogOpen: boolean;
  setJoinDialogOpen: (state: boolean) => void;
}

const JoinMeetingDialog = ({ joinDialogOpen, setJoinDialogOpen }: DialogProps) => {
  const [meetingID, setMeetingID] = useState('');
  const [meetingCode, setMeetingCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const user = useAuthStore((state) => state.user);
  const { join } = useMeetingStore();
  const setUser = useAuthStore((state) => state.setUser);
  const navigate = useNavigate();

  const handleClose = () => {
    setJoinDialogOpen(false);
    setError('');
  };

  const handleJoinMeeting = async () => {
    if (isLoading) return;
    setError('');

    const trimmedId = meetingID.trim();
    const trimmedCode = meetingCode.trim();
    const name = user?.name || fullName.trim();

    if (!trimmedId || !trimmedCode) {
      setError('Please enter both Meeting ID and Meeting Code.');
      return;
    }
    if (!user && !fullName.trim()) {
      setError('Please enter your display name.');
      return;
    }

    try {
      setIsLoading(true);
      const meeting = await join(trimmedId, trimmedCode, name);
      if (meeting) {
        if (meeting.currentParticipant) {
          // setUser(meeting.currentParticipant);
        }
        navigate(`/meeting/${trimmedId}`);
        handleClose();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to join meeting. Please check your details.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={joinDialogOpen} onClose={handleClose} maxWidth="xs" fullWidth>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 3, pt: 2 }}>
        <DialogTitle sx={{ p: 0 }}>Join Meeting</DialogTitle>
        <IconButton onClick={handleClose}>
          <X size={18} />
        </IconButton>
      </Box>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Enter the meeting ID and code provided by the meeting organizer.
        </Typography>
        <TextField
          autoFocus
          margin="dense"
          label="Meeting ID"
          type="text"
          fullWidth
          variant="outlined"
          value={meetingID}
          onChange={(e) => setMeetingID(e.target.value)}
          placeholder="Meeting ID"
        />
        <TextField
          margin="dense"
          label="Meeting Code"
          type="text"
          fullWidth
          variant="outlined"
          value={meetingCode}
          onChange={(e) => setMeetingCode(e.target.value)}
          placeholder="6-digit code"
          onKeyDown={(e) => e.key === 'Enter' && handleJoinMeeting()}
        />
        {!user && (
          <TextField
            margin="dense"
            label="Display Name"
            type="text"
            fullWidth
            variant="outlined"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your name"
          />
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleJoinMeeting}
          disabled={!meetingID || !meetingCode || isLoading}
        >
          {isLoading ? <CircularProgress size={24} /> : 'Join Now'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default JoinMeetingDialog;
