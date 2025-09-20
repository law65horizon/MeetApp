import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  IconButton,
  Paper,
  Switch,
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
  setIsPrivate: (state: boolean) => void;
  meetingTitle: string;
  description: string;
  isPrivate: boolean;
  isLoading: boolean;
  setMeetingTitle: (state: string) => void;
  setDescription: (state: string) => void;
  setIsLoading: (state: boolean) => void;
}

const CreateMeetingDialog = ({
  joinDialogOpen,
  description,
  setDescription,
  setJoinDialogOpen,
  setMeetingTitle,
  setIsLoading,
  meetingTitle,
  isPrivate,
  setIsPrivate,
  isLoading,
}: DialogProps) => {
  const [participants, setParticipants] = useState<string[]>([]);
  const [newParticipant, setNewParticipant] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { create } = useMeetingStore();
  const setUser = useAuthStore((state) => state.setUser);

  const handleStartInstantMeeting = async () => {
    if (isLoading) return;
    setError('');
    try {
      const passcode: number = 111000
      // const passcode: number = Math.floor(100000 + Math.random() * 900000);
      setIsLoading(true);
      const meetingData = await create(isPrivate, passcode, participants, description, meetingTitle, {});
      setUser(meetingData.participants[0]);
      navigate(`/meeting/${meetingData.meetingId}`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to create meeting. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddParticipant = () => {
    const trimmed = newParticipant.trim();
    if (trimmed && !participants.includes(trimmed)) {
      setParticipants([...participants, trimmed]);
      setNewParticipant('');
    }
  };

  const handleRemoveParticipant = (email: string) => {
    setParticipants(participants.filter((p) => p !== email));
  };

  return (
    <Dialog open={joinDialogOpen} onClose={() => setJoinDialogOpen(false)} maxWidth="md" fullWidth>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 3, pt: 2 }}>
        <DialogTitle sx={{ p: 0 }}>Create Meeting</DialogTitle>
        <IconButton onClick={() => setJoinDialogOpen(false)}>
          <X size={18} />
        </IconButton>
      </Box>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <TextField
              label="Meeting Title (Optional)"
              fullWidth
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
              placeholder="e.g., Weekly Team Sync"
            />
          </Grid>
          <Grid item xs={12}>
            <FormControlLabel
              control={<Switch checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />}
              label="Private meeting"
            />
          </Grid>
          {isPrivate && (
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>
                Participants
              </Typography>
              <Box sx={{ display: 'flex', mb: 2 }}>
                <TextField
                  label="Add by email"
                  fullWidth
                  size="small"
                  value={newParticipant}
                  onChange={(e) => setNewParticipant(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddParticipant()}
                  placeholder="email@example.com"
                />
                <Button variant="contained" sx={{ ml: 1 }} onClick={handleAddParticipant}>
                  Add
                </Button>
              </Box>
              <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                {participants.length > 0 ? (
                  participants.map((email, index) => (
                    <Box
                      key={index}
                      sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: index < participants.length - 1 ? 1 : 0 }}
                    >
                      <Typography variant="body2">{email}</Typography>
                      <IconButton size="small" onClick={() => handleRemoveParticipant(email)}>
                        <X size={16} />
                      </IconButton>
                    </Box>
                  ))
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No participants added yet.
                  </Typography>
                )}
              </Paper>
            </Grid>
          )}
          <Grid item xs={12}>
            <TextField
              label="Meeting Description (Optional)"
              fullWidth
              multiline
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add any details about this meeting..."
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={() => setJoinDialogOpen(false)}>Cancel</Button>
        <Button variant="contained" onClick={handleStartInstantMeeting} disabled={isLoading}>
          {isLoading ? <CircularProgress size={24} /> : 'Create Meeting'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CreateMeetingDialog;
