import { useState } from 'react';
import {
  Container,
  Box,
  TextField,
  Button,
  Typography,
  Paper,
  Grid,
  Link,
  useMediaQuery,
  useTheme,
  CircularProgress,
  Alert,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { VideoIcon } from 'lucide-react';
import useAuthStore from '../../store/authStore';
import JoinMeetingDialog from '../../components/ui/JoinMeetingDialog';

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const { login, signup } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please fill in all required fields.');
      return;
    }
    if (!isLogin && !name) {
      setError('Please enter your name.');
      return;
    }

    setLoading(true);
    try {
      const success = isLogin
        ? await login(email, password)
        : await signup(email, password, name);

      if (success) {
        navigate('/');
      } else {
        setError(isLogin ? 'Invalid email or password.' : 'Failed to create account.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container component="main" maxWidth="lg">
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Grid container sx={{ height: isSmallScreen ? 'auto' : '80vh' }}>
          {!isSmallScreen && (
            <Grid
              item
              md={6}
              sx={{
                backgroundImage: 'url(https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2)',
                backgroundRepeat: 'no-repeat',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                borderRadius: '16px 0 0 16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                p: 4,
              }}
            >
              <Box sx={{ backgroundColor: 'rgba(0,0,0,0.5)', p: 3, borderRadius: 2, backdropFilter: 'blur(10px)' }}>
                <Typography variant="h4" sx={{ color: 'white', fontWeight: 700, mb: 2 }}>
                  Connect with your team anywhere, anytime
                </Typography>
                <Typography sx={{ color: 'white' }}>
                  Secure, high-quality video meetings for teams of all sizes.
                </Typography>
              </Box>
            </Grid>
          )}

          <Grid
            item
            xs={12}
            md={6}
            component={Paper}
            elevation={isSmallScreen ? 2 : 0}
            sx={{ p: 4, display: 'flex', flexDirection: 'column', justifyContent: 'center', borderRadius: isSmallScreen ? '16px' : '0 16px 16px 0' }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 400, mx: 'auto', width: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <VideoIcon color={theme.palette.primary.main} size={32} />
                <Typography variant="h4" sx={{ ml: 1, fontWeight: 'bold', color: 'primary.main' }}>
                  MeetApp
                </Typography>
              </Box>

              <Typography component="h1" variant="h5" sx={{ mb: 3 }}>
                {isLogin ? 'Sign in' : 'Create your account'}
              </Typography>

              {error && <Alert severity="error" sx={{ mb: 2, width: '100%' }}>{error}</Alert>}

              <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%' }}>
                {!isLogin && (
                  <TextField
                    margin="normal"
                    required
                    fullWidth
                    label="Full Name"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={loading}
                  />
                )}
                <TextField
                  margin="normal"
                  required
                  fullWidth
                  label="Email Address"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
                <TextField
                  margin="normal"
                  required
                  fullWidth
                  label="Password"
                  type="password"
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />

                <Button type="submit" fullWidth variant="contained" sx={{ mt: 3, mb: 2, py: 1.5 }} disabled={loading}>
                  {loading ? <CircularProgress size={24} /> : isLogin ? 'Sign In' : 'Sign Up'}
                </Button>

                <Grid container justifyContent="center">
                  <Grid item>
                    <Link
                      href="#"
                      variant="body2"
                      onClick={(e) => { e.preventDefault(); setIsLogin(!isLogin); setError(''); }}
                    >
                      {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
                    </Link>
                  </Grid>
                </Grid>

                <Button fullWidth variant="outlined" sx={{ mt: 2, py: 1.5 }} onClick={() => setJoinDialogOpen(true)}>
                  Join Meeting as Guest
                </Button>
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Box>
      <JoinMeetingDialog joinDialogOpen={joinDialogOpen} setJoinDialogOpen={setJoinDialogOpen} />
    </Container>
  );
};

export default AuthPage;
