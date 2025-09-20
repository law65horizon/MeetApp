import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Grid,
  Paper,
  Card,
  CardContent,
  Divider,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  FormControlLabel,
  CircularProgress,
  Alert,
  Snackbar,
  Skeleton,
  Chip,
} from '@mui/material';
import {
  Video,
  Calendar,
  Users,
  Clock,
  Copy,
  Link as LinkIcon,
  PlusCircle,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DatePicker } from '@mui/x-date-pickers';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import useAuthStore from '../../store/authStore';
import useMeetingStore from '../../store/meetingStore';
import CreateMeetingDialog from '../../components/ui/CreateMeetingDialog';
import { fetchUserMeetings, scheduleMeeting } from '../../lib/firebase';

const StartMeetingPage = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  // Dialog open state
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Schedule form state
  const [meetingDate, setMeetingDate] = useState<Date | null>(new Date());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [meetingTitle, setMeetingTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [scheduleParticipants, setScheduleParticipants] = useState<string[]>([]);
  const [newParticipant, setNewParticipant] = useState('');
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleLoading, setScheduleLoading] = useState(false);

  // Instant meeting state (passed down to CreateMeetingDialog)
  const [instantTitle, setInstantTitle] = useState('');
  const [instantDescription, setInstantDescription] = useState('');
  const [instantPrivate, setInstantPrivate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Quick access: user's upcoming meetings
  const [quickMeetings, setQuickMeetings] = useState<any[]>([]);
  const [quickLoading, setQuickLoading] = useState(true);

  // Snackbar
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  const personalMeetingUrl = `${window.location.origin}/meeting/${user?.id}-personal`;

  useEffect(() => {
    fetchUserMeetings()
      .then(({ upcoming }) => setQuickMeetings(upcoming.slice(0, 3)))
      .catch(console.error)
      .finally(() => setQuickLoading(false));
  }, []);

  // ── Schedule ──────────────────────────────────────────────────────────────
  const handleScheduleMeeting = async () => {
    if (!meetingTitle.trim()) {
      setScheduleError('Please enter a meeting title.');
      return;
    }
    if (!meetingDate) {
      setScheduleError('Please select a date.');
      return;
    }
    if (startTime >= endTime) {
      setScheduleError('End time must be after start time.');
      return;
    }

    setScheduleError('');
    setScheduleLoading(true);
    try {
      const passcode = Math.floor(100000 + Math.random() * 900000);
      await scheduleMeeting({
        title: meetingTitle,
        description,
        date: meetingDate,
        startTime,
        endTime,
        isPrivate,
        passcode,
        recipients: scheduleParticipants,
        isRecurring,
        recurrence,
      });
      setScheduleDialogOpen(false);
      setMeetingTitle('');
      setDescription('');
      setScheduleParticipants([]);
      setIsPrivate(false);
      setIsRecurring(false);
      setSnack({ open: true, message: 'Meeting scheduled! Passcode: ' + passcode, severity: 'success' });
      // Refresh quick access
      fetchUserMeetings()
        .then(({ upcoming }) => setQuickMeetings(upcoming.slice(0, 3)))
        .catch(console.error);
    } catch (err: any) {
      setScheduleError(err.message || 'Failed to schedule meeting.');
    } finally {
      setScheduleLoading(false);
    }
  };

  const handleAddParticipant = () => {
    const trimmed = newParticipant.trim();
    if (trimmed && !scheduleParticipants.includes(trimmed)) {
      setScheduleParticipants([...scheduleParticipants, trimmed]);
      setNewParticipant('');
    }
  };

  const handleRemoveParticipant = (email: string) => {
    setScheduleParticipants(scheduleParticipants.filter((p) => p !== email));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSnack({ open: true, message: 'Link copied to clipboard', severity: 'success' });
  };

  const formatMeetingTime = (m: any) => {
    const d = m.scheduledFor?.toDate ? m.scheduledFor.toDate() : new Date(m.scheduledFor);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatMeetingDate = (m: any) => {
    const d = m.scheduledFor?.toDate ? m.scheduledFor.toDate() : new Date(m.scheduledFor);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Start or Schedule a Meeting
      </Typography>

      <Grid container spacing={3}>
        {/* ── Instant meeting ───────────────────────────────────────────────── */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Video color="#3f51b5" size={24} style={{ marginRight: 8 }} />
                <Typography variant="h6">Start an Instant Meeting</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Start a meeting right now and invite people to join.
              </Typography>
              <Box sx={{ flexGrow: 1 }} />
              <Button
                variant="contained"
                size="large"
                startIcon={isLoading ? undefined : <Video />}
                onClick={() => setCreateDialogOpen(true)}
                sx={{ mb: 2 }}
                disabled={isLoading}
              >
                {isLoading ? <CircularProgress size={24} /> : 'Start Meeting Now'}
              </Button>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" gutterBottom>
                Your Personal Meeting Link
              </Typography>
              <Paper
                variant="outlined"
                sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: 'rgba(63,81,181,0.04)' }}
              >
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500, flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {personalMeetingUrl}
                </Typography>
                <IconButton size="small" color="primary" onClick={() => copyToClipboard(personalMeetingUrl)}>
                  <Copy size={18} />
                </IconButton>
              </Paper>
            </CardContent>
          </Card>
        </Grid>

        {/* ── Schedule meeting ──────────────────────────────────────────────── */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Calendar color="#3f51b5" size={24} style={{ marginRight: 8 }} />
                <Typography variant="h6">Schedule a Meeting</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Plan ahead and invite participants. They can join with the meeting code.
              </Typography>
              <Box sx={{ p: 3, backgroundColor: 'rgba(63,81,181,0.04)', borderRadius: 2, display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
                {[
                  { icon: <Calendar size={20} />, text: 'Set a date, time, and invite participants' },
                  { icon: <Users size={20} />, text: 'Add recipient emails to restrict access' },
                  { icon: <Clock size={20} />, text: 'Set up recurring meetings for regular events' },
                ].map(({ icon, text }, i) => (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'center' }}>
                    <Box sx={{ mr: 1, color: 'primary.main' }}>{icon}</Box>
                    <Typography variant="body2">{text}</Typography>
                  </Box>
                ))}
              </Box>
              <Box sx={{ flexGrow: 1 }} />
              <Button variant="outlined" size="large" startIcon={<Calendar />} onClick={() => setScheduleDialogOpen(true)}>
                Schedule Meeting
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* ── Quick Access ──────────────────────────────────────────────────── */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Quick Access
              </Typography>
              <Grid container spacing={2}>
                {quickLoading ? (
                  [1, 2].map((i) => (
                    <Grid item key={i} xs={12} sm={6} md={4} lg={3}>
                      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                        <Skeleton variant="text" height={28} />
                        <Skeleton variant="text" width="60%" />
                        <Skeleton variant="rectangular" height={32} sx={{ mt: 2, borderRadius: 1 }} />
                      </Paper>
                    </Grid>
                  ))
                ) : quickMeetings.length > 0 ? (
                  quickMeetings.map((meeting) => (
                    <Grid item key={meeting.id} xs={12} sm={6} md={4} lg={3}>
                      <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', borderRadius: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="subtitle1" fontWeight={500} noWrap sx={{ flexGrow: 1, mr: 1 }}>
                            {meeting.title}
                          </Typography>
                          {meeting.isPrivate && <Chip label="Private" size="small" sx={{ fontSize: '0.65rem' }} />}
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5, color: 'text.secondary' }}>
                          <Clock size={14} style={{ marginRight: 4 }} />
                          <Typography variant="caption">
                            {formatMeetingDate(meeting)} · {formatMeetingTime(meeting)}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.secondary', mb: 2 }}>
                          <Users size={14} style={{ marginRight: 4 }} />
                          <Typography variant="caption">{meeting.participants?.length || 0} participants</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', mt: 'auto' }}>
                          <Button variant="contained" size="small" sx={{ flexGrow: 1 }} onClick={() => navigate(`/meeting/${meeting.id}`)}>
                            Join
                          </Button>
                          <IconButton size="small" color="primary" sx={{ ml: 1 }} onClick={() => copyToClipboard(`${window.location.origin}/meeting/${meeting.id}`)}>
                            <LinkIcon size={18} />
                          </IconButton>
                        </Box>
                      </Paper>
                    </Grid>
                  ))
                ) : null}

                {/* Always show the "schedule new" card */}
                <Grid item xs={12} sm={6} md={4} lg={3}>
                  <Paper
                    variant="outlined"
                    sx={{ p: 2, display: 'flex', flexDirection: 'column', minHeight: 140, borderRadius: 2, border: '1px dashed', borderColor: 'divider', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    onClick={() => setScheduleDialogOpen(true)}
                  >
                    <IconButton color="primary" sx={{ mb: 1 }} disableRipple>
                      <PlusCircle size={24} />
                    </IconButton>
                    <Typography variant="body2" color="text.secondary">
                      Schedule New Meeting
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Schedule Meeting Dialog ─────────────────────────────────────────── */}
      <Dialog open={scheduleDialogOpen} onClose={() => { setScheduleDialogOpen(false); setScheduleError(''); }} maxWidth="md" fullWidth>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 3, pt: 2 }}>
          <DialogTitle sx={{ p: 0 }}>Schedule a Meeting</DialogTitle>
          <IconButton onClick={() => setScheduleDialogOpen(false)}>
            <X size={18} />
          </IconButton>
        </Box>
        <DialogContent>
          {scheduleError && <Alert severity="error" sx={{ mb: 2 }}>{scheduleError}</Alert>}

          <Grid container spacing={3}>
            {/* Title */}
            <Grid item xs={12}>
              <TextField
                label="Meeting Title"
                fullWidth
                required
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
                placeholder="e.g., Weekly Team Sync"
              />
            </Grid>

            {/* Date & Time */}
            <Grid item xs={12} sm={6}>
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DatePicker
                  label="Date"
                  value={meetingDate}
                  onChange={(v) => setMeetingDate(v)}
                  disablePast
                  slotProps={{ textField: { fullWidth: true, required: true } }}
                />
              </LocalizationProvider>
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                label="Start Time"
                type="time"
                fullWidth
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                label="End Time"
                type="time"
                fullWidth
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            {/* Privacy */}
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={<Switch checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />}
                label="Private meeting"
              />
              <Typography variant="caption" color="text.secondary" display="block">
                Only invited participants can join
              </Typography>
            </Grid>

            {/* Recurring */}
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={<Switch checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />}
                label="Recurring meeting"
              />
            </Grid>

            {isRecurring && (
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Recurrence</InputLabel>
                  <Select value={recurrence} label="Recurrence" onChange={(e) => setRecurrence(e.target.value as any)}>
                    <MenuItem value="daily">Daily</MenuItem>
                    <MenuItem value="weekly">Weekly</MenuItem>
                    <MenuItem value="monthly">Monthly</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            )}

            {/* Participants */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>
                {isPrivate ? 'Allowed Participants *' : 'Participants (optional)'}
              </Typography>
              {isPrivate && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                  Only these users (plus yourself) will be able to join.
                </Typography>
              )}
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
              <Paper variant="outlined" sx={{ p: 2 }}>
                {scheduleParticipants.length > 0 ? (
                  scheduleParticipants.map((email, index) => (
                    <Box key={index} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: index < scheduleParticipants.length - 1 ? 1 : 0 }}>
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

            {/* Description */}
            <Grid item xs={12}>
              <TextField
                label="Description (Optional)"
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
          <Button onClick={() => setScheduleDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleScheduleMeeting} disabled={scheduleLoading || !meetingTitle.trim()}>
            {scheduleLoading ? <CircularProgress size={24} /> : 'Schedule Meeting'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Instant Meeting Dialog ────────────────────────────────────────── */}
      <CreateMeetingDialog
        setJoinDialogOpen={setCreateDialogOpen}
        joinDialogOpen={createDialogOpen}
        meetingTitle={instantTitle}
        isPrivate={instantPrivate}
        setIsPrivate={setInstantPrivate}
        setMeetingTitle={setInstantTitle}
        setDescription={setInstantDescription}
        description={instantDescription}
        isLoading={isLoading}
        setIsLoading={setIsLoading}
      />

      <Snackbar open={snack.open} autoHideDuration={5000} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
        <Alert severity={snack.severity} sx={{ width: '100%' }}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default StartMeetingPage;
