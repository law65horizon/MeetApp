import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Grid,
  Divider,
  Paper,
  Chip,
  useTheme,
  Skeleton,
} from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Video, Calendar, Share2, ChevronRight, CheckCircle, Clock } from 'lucide-react';
import useAuthStore from '../../store/authStore';
import { fetchUserMeetings } from '../../lib/firebase';
import JoinMeetingDialog from '../../components/ui/JoinMeetingDialog';
import useMeetingStore from '../../store/meetingStore';

const HomePage = () => {
  const { user } = useAuthStore();
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [upcomingMeetings, setUpcomingMeetings] = useState<any[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(true);
  const [joiningMeeting, setJoinMeeting] = useState(false);
  const theme = useTheme();
  const navigate = useNavigate()
  const {join} = useMeetingStore()

  useEffect(() => {
    fetchUserMeetings()
      .then(({ upcoming }) => setUpcomingMeetings(upcoming))
      .catch(console.error)
      .finally(() => setMeetingsLoading(false));
  }, []);

  const upcomingMeeting = upcomingMeetings[0] || null;

  const meetingDate = upcomingMeeting?.scheduledFor
    ? new Date(upcomingMeeting.scheduledFor)
    : null;
  const formattedTime = meetingDate?.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const onboardingSteps = [
    {
      title: 'Create your first meeting',
      description: 'Start a new meeting and invite participants',
      icon: <Video size={24} color={theme.palette.primary.main} />,
      completed: upcomingMeetings.length > 0,
    },
    {
      title: 'Schedule a meeting',
      description: 'Plan ahead by scheduling a meeting',
      icon: <Calendar size={24} color={theme.palette.primary.main} />,
      completed: false,
    },
    {
      title: 'Share your personal meeting link',
      description: 'Send your personal meeting link to connect instantly',
      icon: <Share2 size={24} color={theme.palette.primary.main} />,
      completed: false,
    },
  ];

  const handleJoinMeeting = async (meetingId:any, passcode:any) => {
    // if (joiningMeeting) return
    try {
      console.log('idoioew')
      // setJoinMeeting(true);
      const meeting = await join(meetingId, passcode, user?.name);
      console.log('ijiowje')
      console.log({meeting})
      if (meeting) {
        if (meeting.currentParticipant) {
          // setUser(meeting.currentParticipant);
        }
        navigate(`/meeting/${meetingId}`);
        // handleClose();
      }
    } catch (err: any) {
      // setError(err.message || 'Failed to join meeting. Please check your details.');
    } finally {
      setJoinMeeting(false);
    }
  };

  useEffect(() => {
    const interval = setInterval(
      () => setCurrentStep((prev) => (prev + 1) % onboardingSteps.length),
      5000
    );
    return () => clearInterval(interval);
  }, []);

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
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Welcome back, {user?.name?.split(' ')[0]}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Your meetings and updates at a glance
        </Typography>
      </Box>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={4}>
          <Button
            component={RouterLink}
            to="/start-meeting"
            variant="contained"
            color="primary"
            fullWidth
            startIcon={<Video size={20} />}
            sx={{ p: 1.5, fontWeight: 500 }}
          >
            Start New Meeting
          </Button>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Button
            variant="outlined"
            fullWidth
            onClick={() => setJoinDialogOpen(true)}
            sx={{ p: 1.5, fontWeight: 500 }}
          >
            Join with Code
          </Button>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Button
            component={RouterLink}
            to="/meetings"
            variant="outlined"
            fullWidth
            startIcon={<Calendar size={20} />}
            sx={{ p: 1.5, fontWeight: 500 }}
          >
            Schedule a Meeting
          </Button>
        </Grid>
      </Grid>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" component="h2">
                  Next Meeting
                </Typography>
                <Chip label="Upcoming" size="small" color="primary" sx={{ fontWeight: 500 }} />
              </Box>

              {meetingsLoading ? (
                <>
                  <Skeleton variant="text" height={32} />
                  <Skeleton variant="text" width="60%" />
                </>
              ) : upcomingMeeting ? (
                <Box>
                  <Typography variant="h5" component="div" sx={{ mb: 1 }}>
                    {upcomingMeeting.title}
                  </Typography>
                  {meetingDate && (
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, color: 'text.secondary' }}>
                      <Clock size={18} />
                      <Typography variant="body2" sx={{ ml: 1 }}>
                        {formatMeetingDate(upcomingMeeting)} · {formatMeetingTime(upcomingMeeting)}
                      </Typography>
                    </Box>
                  )}
                  {upcomingMeeting.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {upcomingMeeting.description}
                    </Typography>
                  )}
                  <Button
                    // component={RouterLink}
                    disabled={joiningMeeting}
                    onClick={() => handleJoinMeeting(upcomingMeeting.id, upcomingMeeting.passcode)}
                    // to={`/meeting/${upcomingMeeting.id}`}
                    variant="contained"
                    size="small"
                    sx={{ mt: 1 }}
                  >
                    Join Meeting
                  </Button>
                </Box>
              ) : (
                <Typography variant="body1" color="text.secondary">
                  No upcoming meetings scheduled.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
                At a Glance
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2,
                      textAlign: 'center',
                      bgcolor: 'primary.light',
                      color: 'primary.contrastText',
                      borderRadius: 2,
                    }}
                  >
                    <Typography variant="h4" component="div">
                      {meetingsLoading ? <Skeleton /> : upcomingMeetings.length}
                    </Typography>
                    <Typography variant="body2">Upcoming Meetings</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2,
                      textAlign: 'center',
                      bgcolor: 'secondary.light',
                      color: 'secondary.contrastText',
                      borderRadius: 2,
                    }}
                  >
                    <Typography variant="h4" component="div">
                      {meetingsLoading ? (
                        <Skeleton />
                      ) : (
                        upcomingMeetings.filter((m) => {
                          const d = m.scheduledFor?.toDate ? m.scheduledFor.toDate() : null;
                          return d && d.toDateString() === new Date().toDateString();
                        }).length
                      )}
                    </Typography>
                    <Typography variant="body2">Meetings Today</Typography>
                  </Paper>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Onboarding guide */}
      <Card sx={{ mb: 4, overflow: 'hidden' }}>
        <CardContent>
          <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
            Getting Started
          </Typography>
          <Box sx={{ position: 'relative', minHeight: 130 }}>
            {onboardingSteps.map((step, index) => (
              <Box
                key={index}
                sx={{
                  position: 'absolute',
                  width: '100%',
                  transition: 'all 0.5s ease',
                  opacity: currentStep === index ? 1 : 0,
                  transform: currentStep === index ? 'translateX(0)' : 'translateX(100%)',
                  display: 'flex',
                  alignItems: 'center',
                  visibility: currentStep === index ? 'visible' : 'hidden',
                }}
              >
                <Box sx={{ mr: 2 }}>{step.icon}</Box>
                <Box sx={{ flexGrow: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
                      {step.title}
                    </Typography>
                    {step.completed && (
                      <CheckCircle
                        size={16}
                        color={theme.palette.success.main}
                        style={{ marginLeft: '8px' }}
                      />
                    )}
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {step.description}
                  </Typography>
                </Box>
                <Button variant="text" endIcon={<ChevronRight size={18} />} size="small">
                  {step.completed ? 'Completed' : 'Get Started'}
                </Button>
              </Box>
            ))}
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            {onboardingSteps.map((_, index) => (
              <Box
                key={index}
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: currentStep === index ? 'primary.main' : 'grey.300',
                  mx: 0.5,
                  cursor: 'pointer',
                }}
                onClick={() => setCurrentStep(index)}
              />
            ))}
          </Box>
        </CardContent>
      </Card>

      <JoinMeetingDialog joinDialogOpen={joinDialogOpen} setJoinDialogOpen={setJoinDialogOpen} />
    </Box>
  );
};

export default HomePage;
