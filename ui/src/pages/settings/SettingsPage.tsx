import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Tabs,
  Tab,
  Divider,
  Switch,
  FormControlLabel,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  CircularProgress,
  Alert,
  Snackbar,
  Stack,
} from '@mui/material';
import {
  fetchUserSettings,
  saveUserSettings,
  UserSettings,
  DEFAULT_SETTINGS,
} from '../../lib/firebase';
import { useNewMeetingStore } from '../../store/newMeetingStore';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel = ({ children, value, index, ...other }: TabPanelProps) => (
  <div
    role="tabpanel"
    hidden={value !== index}
    id={`settings-tabpanel-${index}`}
    aria-labelledby={`settings-tab-${index}`}
    {...other}
  >
    {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
  </div>
);

// Common timezones list
const TIMEZONES = [
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
];

const SettingsPage = () => {
  const [tabValue, setTabValue] = useState(0);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  // Device lists for Audio & Video tab
  const devices = useNewMeetingStore((s) => s.devices);
  const fetchDevices = useNewMeetingStore((s) => s.fetchDevices);
  const setAudioInput = useNewMeetingStore((s) => s.setAudioInput);
  const setAudioOutput = useNewMeetingStore((s) => s.setAudioOutput);
  const setVideoInput = useNewMeetingStore((s) => s.setVideoInput);

  // Load saved settings from Firestore on mount
  useEffect(() => {
    fetchUserSettings()
      .then((saved) => setSettings(saved))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Enumerate real devices when Audio & Video tab is opened
  useEffect(() => {
    if (tabValue === 1) {
      fetchDevices();
    }
  }, [tabValue, fetchDevices]);

  const update = useCallback(<K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    // Also push device selections into the meeting store immediately
    if (key === 'selectedAudioInput') setAudioInput(value as string);
    if (key === 'selectedAudioOutput') setAudioOutput(value as string);
    if (key === 'selectedVideoInput') setVideoInput(value as string);
  }, [setAudioInput, setAudioOutput, setVideoInput]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveUserSettings(settings);
      setSnack({ open: true, message: 'Settings saved!', severity: 'success' });
    } catch (err: any) {
      setSnack({ open: true, message: err.message || 'Failed to save settings.', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const audioInputs = devices.filter((d) => d.kind === 'audioinput');
  const audioOutputs = devices.filter((d) => d.kind === 'audiooutput');
  const videoInputs = devices.filter((d) => d.kind === 'videoinput');

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" component="h1">
          Settings
        </Typography>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? <CircularProgress size={22} /> : 'Save Changes'}
        </Button>
      </Box>

      <Card>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={tabValue}
            onChange={(_, v) => setTabValue(v)}
            aria-label="settings tabs"
            sx={{ px: 2, '& .MuiTab-root': { minHeight: '64px', textTransform: 'none', fontWeight: 500 } }}
          >
            <Tab label="General" id="settings-tab-0" />
            <Tab label="Audio & Video" id="settings-tab-1" />
            <Tab label="Notifications" id="settings-tab-2" />
          </Tabs>
        </Box>

        <CardContent>
          {/* ── General ─────────────────────────────────────────────────── */}
          <TabPanel value={tabValue} index={0}>
            <Typography variant="h6" gutterBottom>General Settings</Typography>

            <Box sx={{ mb: 4 }}>
              <Typography variant="subtitle1" gutterBottom>Language & Region</Typography>
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Language</InputLabel>
                    <Select value={settings.language} label="Language" onChange={(e) => update('language', e.target.value)}>
                      <MenuItem value="en">English</MenuItem>
                      <MenuItem value="es">Español</MenuItem>
                      <MenuItem value="fr">Français</MenuItem>
                      <MenuItem value="de">Deutsch</MenuItem>
                    </Select>
                    <FormHelperText>Interface language</FormHelperText>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Time Zone</InputLabel>
                    <Select value={settings.timezone} label="Time Zone" onChange={(e) => update('timezone', e.target.value)}>
                      {TIMEZONES.map((tz) => (
                        <MenuItem key={tz} value={tz}>{tz}</MenuItem>
                      ))}
                    </Select>
                    <FormHelperText>Meeting times display in this zone</FormHelperText>
                  </FormControl>
                </Grid>
              </Grid>
            </Box>

            <Divider sx={{ my: 3 }} />

            <Box sx={{ mb: 4 }}>
              <Typography variant="subtitle1" gutterBottom>Theme & Appearance</Typography>
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Theme</InputLabel>
                    <Select value={settings.theme} label="Theme" onChange={(e) => update('theme', e.target.value as UserSettings['theme'])}>
                      <MenuItem value="light">Light</MenuItem>
                      <MenuItem value="dark">Dark</MenuItem>
                      <MenuItem value="system">System Default</MenuItem>
                    </Select>
                    <FormHelperText>Requires page refresh to apply</FormHelperText>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={<Switch checked={settings.showAnimations} onChange={(e) => update('showAnimations', e.target.checked)} />}
                    label="Show animations"
                  />
                  <FormHelperText>Enable or disable UI animations</FormHelperText>
                </Grid>
              </Grid>
            </Box>

            <Divider sx={{ my: 3 }} />

            <Box>
              <Typography variant="subtitle1" gutterBottom>Meeting Security</Typography>
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={<Switch checked={settings.requirePasscodeForPersonal} onChange={(e) => update('requirePasscodeForPersonal', e.target.checked)} />}
                    label="Require passcode for personal meetings"
                  />
                  <FormHelperText>Participants must enter a passcode to join your personal room</FormHelperText>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={<Switch checked={settings.enableWaitingRoom} onChange={(e) => update('enableWaitingRoom', e.target.checked)} />}
                    label="Enable waiting room"
                  />
                  <FormHelperText>Participants wait until you admit them</FormHelperText>
                </Grid>
              </Grid>
            </Box>
          </TabPanel>

          {/* ── Audio & Video ────────────────────────────────────────────── */}
          <TabPanel value={tabValue} index={1}>
            <Typography variant="h6" gutterBottom>Audio & Video Settings</Typography>

            <Box sx={{ mb: 4 }}>
              <Typography variant="subtitle1" gutterBottom>Audio</Typography>
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Microphone</InputLabel>
                    <Select
                      value={settings.selectedAudioInput}
                      label="Microphone"
                      onChange={(e) => update('selectedAudioInput', e.target.value)}
                    >
                      <MenuItem value="default">Default Microphone</MenuItem>
                      {audioInputs.map((d) => (
                        <MenuItem key={d.deviceId} value={d.deviceId}>{d.label}</MenuItem>
                      ))}
                    </Select>
                    <FormHelperText>Microphone used in meetings</FormHelperText>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Speaker</InputLabel>
                    <Select
                      value={settings.selectedAudioOutput}
                      label="Speaker"
                      onChange={(e) => update('selectedAudioOutput', e.target.value)}
                    >
                      <MenuItem value="default">Default Speaker</MenuItem>
                      {audioOutputs.map((d) => (
                        <MenuItem key={d.deviceId} value={d.deviceId}>{d.label}</MenuItem>
                      ))}
                    </Select>
                    <FormHelperText>Speaker used in meetings</FormHelperText>
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={<Switch checked={settings.autoMuteMic} onChange={(e) => update('autoMuteMic', e.target.checked)} />}
                    label="Automatically mute my microphone when joining"
                  />
                </Grid>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={<Switch checked={settings.autoAdjustMicVolume} onChange={(e) => update('autoAdjustMicVolume', e.target.checked)} />}
                    label="Automatically adjust microphone volume"
                  />
                </Grid>
              </Grid>
            </Box>

            <Divider sx={{ my: 3 }} />

            <Box>
              <Typography variant="subtitle1" gutterBottom>Video</Typography>
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Camera</InputLabel>
                    <Select
                      value={settings.selectedVideoInput}
                      label="Camera"
                      onChange={(e) => update('selectedVideoInput', e.target.value)}
                    >
                      <MenuItem value="default">Default Camera</MenuItem>
                      {videoInputs.map((d) => (
                        <MenuItem key={d.deviceId} value={d.deviceId}>{d.label}</MenuItem>
                      ))}
                    </Select>
                    <FormHelperText>Camera used in meetings</FormHelperText>
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={<Switch checked={settings.turnOffVideoOnJoin} onChange={(e) => update('turnOffVideoOnJoin', e.target.checked)} />}
                    label="Turn off my video when joining meetings"
                  />
                </Grid>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={<Switch checked={settings.showParticipantNames} onChange={(e) => update('showParticipantNames', e.target.checked)} />}
                    label="Always show participant names on their videos"
                  />
                </Grid>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={<Switch checked={settings.enableHdVideo} onChange={(e) => update('enableHdVideo', e.target.checked)} />}
                    label="Enable HD video when available"
                  />
                </Grid>
              </Grid>
            </Box>
          </TabPanel>

          {/* ── Notifications ────────────────────────────────────────────── */}
          <TabPanel value={tabValue} index={2}>
            <Typography variant="h6" gutterBottom>Notification Settings</Typography>

            <Box sx={{ mb: 4 }}>
              <Typography variant="subtitle1" gutterBottom>Meeting Notifications</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={<Switch checked={settings.meetingReminders} onChange={(e) => update('meetingReminders', e.target.checked)} />}
                    label="Meeting reminder notifications"
                  />
                  <FormHelperText>Get notified before your scheduled meetings start</FormHelperText>
                </Grid>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={<Switch checked={settings.meetingInvitations} onChange={(e) => update('meetingInvitations', e.target.checked)} />}
                    label="Meeting invitation notifications"
                  />
                  <FormHelperText>Get notified when you're invited to a meeting</FormHelperText>
                </Grid>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={<Switch checked={settings.inMeetingNotifications} onChange={(e) => update('inMeetingNotifications', e.target.checked)} />}
                    label="In-meeting notifications"
                  />
                  <FormHelperText>Chat messages and participant actions during meetings</FormHelperText>
                </Grid>
              </Grid>
            </Box>

            <Divider sx={{ my: 3 }} />

            <Box>
              <Typography variant="subtitle1" gutterBottom>Email Notifications</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={<Switch checked={settings.emailInvitations} onChange={(e) => update('emailInvitations', e.target.checked)} />}
                    label="Send meeting invitations by email"
                  />
                </Grid>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={<Switch checked={settings.emailReminders} onChange={(e) => update('emailReminders', e.target.checked)} />}
                    label="Send email reminders for upcoming meetings"
                  />
                </Grid>
                {settings.emailReminders && (
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
                      <InputLabel>Reminder Time</InputLabel>
                      <Select value={settings.reminderMinutes} label="Reminder Time" onChange={(e) => update('reminderMinutes', e.target.value)}>
                        <MenuItem value="5">5 minutes before</MenuItem>
                        <MenuItem value="10">10 minutes before</MenuItem>
                        <MenuItem value="15">15 minutes before</MenuItem>
                        <MenuItem value="30">30 minutes before</MenuItem>
                        <MenuItem value="60">1 hour before</MenuItem>
                      </Select>
                      <FormHelperText>How far in advance to send reminders</FormHelperText>
                    </FormControl>
                  </Grid>
                )}
              </Grid>
            </Box>
          </TabPanel>
        </CardContent>
      </Card>

      <Snackbar open={snack.open} autoHideDuration={3000} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
        <Alert severity={snack.severity} sx={{ width: '100%' }}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default SettingsPage;
