import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Avatar,
  Button,
  TextField,
  Grid,
  Divider,
  IconButton,
  Stack,
  Snackbar,
  Alert,
  Skeleton,
} from '@mui/material';
import { Edit, Camera, Save } from 'lucide-react';
import { auth, db } from '../../lib/firebase';
import { updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import useAuthStore from '../../store/authStore';

const ProfilePage = () => {
  const { user, setUser } = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [timezone, setTimezone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  useEffect(() => {
    if (!user?.id) return;
    getDoc(doc(db, 'users', user.id))
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setName(data.name || user.name || '');
          setEmail(data.email || user.email || '');
          setJobTitle(data.jobTitle || '');
          setDepartment(data.department || '');
          setTimezone(data.timezone || '');
        } else {
          setName(user.name || '');
          setEmail(user.email || '');
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user?.id]);

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      await setDoc(
        doc(db, 'users', user.id),
        { name, email, jobTitle, department, timezone, updatedAt: serverTimestamp() },
        { merge: true }
      );
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: name });
      }
      setUser({ ...user, name, email });
      setEditing(false);
      setSnack({ open: true, message: 'Profile saved!', severity: 'success' });
    } catch (err) {
      console.error(err);
      setSnack({ open: true, message: 'Failed to save profile.', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Profile
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
              <Box sx={{ position: 'relative' }}>
                <Avatar sx={{ width: 120, height: 120, mb: 2, fontSize: '3rem' }}>
                  {(name || user?.name || 'U')[0].toUpperCase()}
                </Avatar>
                <IconButton
                  sx={{ position: 'absolute', bottom: 0, right: 0, bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' } }}
                >
                  <Camera size={18} />
                </IconButton>
              </Box>
              {loading ? (
                <Skeleton variant="text" width={120} height={32} />
              ) : (
                <>
                  <Typography variant="h5" sx={{ mt: 2, fontWeight: 500 }}>
                    {name}
                  </Typography>
                  {(jobTitle || department) && (
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {[jobTitle, department].filter(Boolean).join(' • ')}
                    </Typography>
                  )}
                  <Typography variant="body2" sx={{ mt: 2, textAlign: 'center' }}>
                    Personal Meeting ID: <br />
                    <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                      {user?.id?.slice(0, 12) || '—'}
                    </Box>
                  </Typography>
                  <Button
                    variant="outlined"
                    sx={{ mt: 3 }}
                    fullWidth
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/meeting/${user?.id}-personal`);
                      setSnack({ open: true, message: 'Link copied!', severity: 'success' });
                    }}
                  >
                    Copy Personal Meeting Link
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h6">Profile Information</Typography>
                <Button
                  startIcon={editing ? <Save size={18} /> : <Edit size={18} />}
                  onClick={() => (editing ? handleSave() : setEditing(true))}
                  variant={editing ? 'contained' : 'outlined'}
                  disabled={saving}
                >
                  {editing ? (saving ? 'Saving…' : 'Save Changes') : 'Edit Profile'}
                </Button>
              </Box>

              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <TextField label="Full Name" fullWidth value={name} onChange={(e) => setName(e.target.value)} disabled={!editing} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField label="Email Address" fullWidth value={email} onChange={(e) => setEmail(e.target.value)} disabled />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField label="Job Title" fullWidth value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} disabled={!editing} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField label="Department" fullWidth value={department} onChange={(e) => setDepartment(e.target.value)} disabled={!editing} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField label="Time Zone" fullWidth value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={!editing} />
                </Grid>
              </Grid>

              <Divider sx={{ my: 4 }} />
              <Typography variant="h6" gutterBottom>Security & Privacy</Typography>
              <Stack spacing={2} direction="row" flexWrap="wrap">
                <Button variant="outlined" color="primary">Change Password</Button>
                <Button variant="outlined" color="primary">Enable Two-Factor Authentication</Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Snackbar open={snack.open} autoHideDuration={3000} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
        <Alert severity={snack.severity} sx={{ width: '100%' }}>
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ProfilePage;
