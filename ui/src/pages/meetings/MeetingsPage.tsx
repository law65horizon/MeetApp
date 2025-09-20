import { useState, useEffect } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Card,
  CardContent,
  Typography,
  Button,
  List,
  ListItem,
  Divider,
  Chip,
  IconButton,
  useTheme,
  Skeleton,
  Snackbar,
  Alert,
} from '@mui/material';
import { Video, Calendar, Clock, Users, Link as LinkIcon, Copy, MoreVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchUserMeetings } from '../../lib/firebase';
import useAuthStore from '../../store/authStore';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel = ({ children, value, index, ...other }: TabPanelProps) => (
  <div
    role="tabpanel"
    hidden={value !== index}
    id={`meeting-tabpanel-${index}`}
    aria-labelledby={`meeting-tab-${index}`}
    {...other}
  >
    {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
  </div>
);

const MeetingsPage = () => {
  const [tabValue, setTabValue] = useState(0);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [previous, setPrevious] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();
  const theme = useTheme();
  const { user } = useAuthStore();

  useEffect(() => {
    fetchUserMeetings()
      .then(({ upcoming, previous }) => {
        setUpcoming(upcoming);
        setPrevious(previous);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const formatTime = (value: any) => {
    const date = value?.toDate ? value.toDate() : new Date(value);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (value: any) => {
    const date = value?.toDate ? value.toDate() : new Date(value);
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
  };

  const personalRoomUrl = `${window.location.origin}/meeting/${user?.id}-personal`;

  const SkeletonRow = () => (
    <Box sx={{ py: 2 }}>
      <Skeleton variant="text" height={28} width="30%" />
      <Skeleton variant="text" height={20} width="50%" />
    </Box>
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Meetings
        </Typography>
        <Button
          variant="contained"
          startIcon={<Calendar />}
          onClick={() => navigate('/start-meeting')}
        >
          Schedule Meeting
        </Button>
      </Box>

      <Card>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={tabValue}
            onChange={(_, v) => setTabValue(v)}
            aria-label="meeting tabs"
            sx={{ px: 2, '& .MuiTab-root': { minHeight: '64px', textTransform: 'none', fontWeight: 500 } }}
          >
            <Tab icon={<Calendar />} iconPosition="start" label="Upcoming" id="meeting-tab-0" />
            <Tab icon={<Clock />} iconPosition="start" label="Previous" id="meeting-tab-1" />
            <Tab icon={<Video />} iconPosition="start" label="Personal Room" id="meeting-tab-2" />
          </Tabs>
        </Box>

        {/* Upcoming */}
        <TabPanel value={tabValue} index={0}>
          <List sx={{ px: 2 }}>
            {loading ? (
              [1, 2, 3].map((i) => <SkeletonRow key={i} />)
            ) : upcoming.length > 0 ? (
              upcoming.map((meeting, index) => (
                <Box key={meeting.id}>
                  <ListItem
                    disablePadding
                    sx={{
                      display: 'flex',
                      flexDirection: { xs: 'column', sm: 'row' },
                      alignItems: { xs: 'flex-start', sm: 'center' },
                      py: 2,
                    }}
                  >
                    <Box sx={{ width: { xs: '100%', sm: '180px' }, mb: { xs: 2, sm: 0 }, flexDirection: 'column', display: 'flex' }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
                        {formatDate(meeting.scheduledFor || meeting.createdAt)}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.secondary' }}>
                        <Clock size={16} style={{ marginRight: '4px' }} />
                        <Typography variant="body2">
                          {formatTime(meeting.scheduledFor || meeting.createdAt)}
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="h6" sx={{ mb: 0.5 }}>
                        {meeting.title}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                        <Users size={16} style={{ color: theme.palette.text.secondary, marginRight: '4px' }} />
                        <Typography variant="body2" color="text.secondary">
                          {meeting.participants?.length || 0} participants
                        </Typography>
                      </Box>
                      {meeting.description && (
                        <Typography variant="body2" color="text.secondary">
                          {meeting.description}
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', mt: { xs: 2, sm: 0 } }}>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => navigate(`/meeting/${meeting.id}`)}
                        sx={{ mr: 1 }}
                      >
                        Join
                      </Button>
                      <IconButton size="small" onClick={() => copyToClipboard(`${window.location.origin}/meeting/${meeting.id}`)}>
                        <Copy size={16} />
                      </IconButton>
                    </Box>
                  </ListItem>
                  {index < upcoming.length - 1 && <Divider />}
                </Box>
              ))
            ) : (
              <Typography variant="body1" sx={{ textAlign: 'center', py: 4 }}>
                No upcoming meetings scheduled.{' '}
                <Button variant="text" onClick={() => navigate('/start-meeting')}>
                  Schedule one now
                </Button>
              </Typography>
            )}
          </List>
        </TabPanel>

        {/* Previous */}
        <TabPanel value={tabValue} index={1}>
          <List sx={{ px: 2 }}>
            {loading ? (
              [1, 2].map((i) => <SkeletonRow key={i} />)
            ) : previous.length > 0 ? (
              previous.map((meeting, index) => (
                <Box key={meeting.id}>
                  <ListItem
                    disablePadding
                    sx={{
                      display: 'flex',
                      flexDirection: { xs: 'column', sm: 'row' },
                      alignItems: { xs: 'flex-start', sm: 'center' },
                      py: 2,
                    }}
                  >
                    <Box sx={{ width: { xs: '100%', sm: '180px' }, mb: { xs: 2, sm: 0 } }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
                        {formatDate(meeting.scheduledFor || meeting.createdAt)}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.secondary' }}>
                        <Clock size={16} style={{ marginRight: '4px' }} />
                        <Typography variant="body2">
                          {formatTime(meeting.scheduledFor || meeting.createdAt)}
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="h6" sx={{ mb: 0.5 }}>
                        {meeting.title}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Users size={16} style={{ color: theme.palette.text.secondary, marginRight: '4px' }} />
                        <Typography variant="body2" color="text.secondary">
                          {meeting.participants?.length || 0} participants
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', mt: { xs: 2, sm: 0 } }}>
                      <Chip label="Completed" size="small" sx={{ bgcolor: 'rgba(0,150,136,0.1)', color: 'secondary.main', mr: 1 }} />
                      <IconButton size="small">
                        <MoreVertical size={18} />
                      </IconButton>
                    </Box>
                  </ListItem>
                  {index < previous.length - 1 && <Divider />}
                </Box>
              ))
            ) : (
              <Typography variant="body1" sx={{ textAlign: 'center', py: 4 }}>
                No previous meetings found.
              </Typography>
            )}
          </List>
        </TabPanel>

        {/* Personal Room */}
        <TabPanel value={tabValue} index={2}>
          <CardContent>
            <Typography variant="h5" component="h2" gutterBottom>
              Your Personal Meeting Room
            </Typography>
            <Typography variant="body2" paragraph>
              Your personal meeting room is always available. Use it for quick meetings without scheduling.
            </Typography>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                bgcolor: 'rgba(63,81,181,0.08)',
                p: 2,
                borderRadius: 1,
                mb: 3,
              }}
            >
              <LinkIcon size={20} style={{ color: theme.palette.primary.main, marginRight: '8px' }} />
              <Typography variant="body2" sx={{ flexGrow: 1, fontFamily: 'monospace', fontWeight: 500 }}>
                {personalRoomUrl}
              </Typography>
              <IconButton size="small" onClick={() => copyToClipboard(personalRoomUrl)} sx={{ color: 'primary.main' }}>
                <Copy size={18} />
              </IconButton>
            </Box>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Button variant="contained" startIcon={<Video />} onClick={() => navigate(`/meeting/${user?.id}-personal`)}>
                Start Meeting Now
              </Button>
              <Button variant="outlined" startIcon={<Copy />} onClick={() => copyToClipboard(personalRoomUrl)}>
                Copy Invite Link
              </Button>
            </Box>
          </CardContent>
        </TabPanel>
      </Card>

      <Snackbar open={copied} autoHideDuration={2000} onClose={() => setCopied(false)}>
        <Alert severity="success" sx={{ width: '100%' }}>
          Link copied to clipboard
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default MeetingsPage;
