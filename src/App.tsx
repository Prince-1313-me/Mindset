import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  onSnapshot, 
  updateDoc, 
  deleteDoc,
  Timestamp,
  orderBy,
  limit,
  addDoc,
  getDocFromServer
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User as FirebaseUser,
  signOut
} from 'firebase/auth';
import { 
  format, 
  startOfToday, 
  isSameDay, 
  subDays, 
  startOfDay,
  differenceInDays,
  parseISO,
  parse
} from 'date-fns';
import { 
  Flame, 
  CheckCircle2, 
  Circle, 
  Plus, 
  Trash2, 
  BarChart3, 
  Settings, 
  LogOut, 
  Smartphone,
  AlertTriangle,
  BrainCircuit,
  ChevronRight,
  Sun,
  Moon,
  Bell,
  BellOff,
  Clock,
  Users,
  Activity,
  ShieldCheck,
  Calendar as CalendarIcon,
  Search
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from './firebase';
import { getCoachFeedback, CoachFeedback } from './services/geminiService';
import { cn } from './lib/utils';
import { Chatbot } from './components/Chatbot';

// --- Types ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface UserProfile {
  uid: string;
  email?: string;
  displayName?: string;
  role?: 'user' | 'admin';
  streak: number;
  lastActiveDate: string;
  missedDaysCount: number;
  screenTimeLimit: number;
  preferredRoutineId?: string;
}

interface Task {
  id: string;
  userId: string;
  title: string;
  completed: boolean;
  date: string;
  routineId?: string;
  reminderTime?: string;
}

interface Routine {
  id: string;
  userId?: string;
  name: string;
  description: string;
  tasks: string[];
  imageUrl?: string;
}

interface HistoryRecord {
  userId: string;
  date: string;
  completionRate: number;
  screenTime: number;
  streakAtDate: number;
}

// --- Constants ---
const DEFAULT_ROUTINES: Routine[] = [
  {
    id: 'balanced-beginner',
    name: 'The Balanced Beginner',
    description: 'Best for: Users who want to build discipline slowly without burning out.',
    tasks: [
      '07:00 AM: Wake up & Hydrate (1 glass of water)',
      '07:15 AM: 15-min light stretching or meditation',
      '08:00 AM: Learn something new (e.g., English vocabulary, reading 5 pages of a book)',
      '09:00 AM: Core Work/Study block',
      '01:30 PM: Mindful Lunch (No screens allowed)',
      '06:00 PM: Evening walk (Leave the phone at home)',
      '09:30 PM: Plan tomorrow\'s top 3 tasks',
      '10:30 PM: Sleep'
    ],
    imageUrl: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&q=80&w=800'
  },
  {
    id: 'tech-sprint',
    name: 'The Tech Sprint',
    description: 'Best for: Developers, tech enthusiasts, and people working on complex projects.',
    tasks: [
      '06:30 AM: Wake up & Black Coffee',
      '07:00 AM: Morning review (Check GitHub, project boards, or daily goals)',
      '08:00 AM: Deep Work Block 1 (Coding, building architecture like Vercel/Firebase)',
      '11:00 AM: Break & Hydrate',
      '11:15 AM: Deep Work Block 2 (Debugging, problem-solving, AI model training)',
      '02:00 PM: Lunch & Tech Podcasts/Articles',
      '05:00 PM: Wrap up tasks & push final code/commits',
      '08:00 PM: Screen-free relaxation'
    ],
    imageUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&q=80&w=800'
  },
  {
    id: 'exam-grind',
    name: 'The Exam Grind',
    description: 'Best for: Students preparing for tough exams who need to cover specific syllabus units without panicking.',
    tasks: [
      '06:00 AM: Wake up & quick workout (to get blood flowing)',
      '06:30 AM: Active Recall / Revision of yesterday\'s topics',
      '08:00 AM: Study Block 1: Unit A (High difficulty subject)',
      '11:00 AM: 20-min break (Listen to music, walk)',
      '11:30 AM: Study Block 2: Unit B (Medium difficulty)',
      '03:00 PM: Attempt mock tests or practice questions',
      '06:00 PM: Review mistakes from practice',
      '09:00 PM: Light reading & sleep preparation (No late-night cramming)'
    ],
    imageUrl: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&q=80&w=800'
  },
  {
    id: 'creators-flow',
    name: 'The Creator\'s Flow',
    description: 'Best for: Digital marketers, content creators, and strategists.',
    tasks: [
      '07:30 AM: Wake up & Morning Journaling',
      '08:30 AM: Industry research (Global marketing trends, checking competitors)',
      '10:00 AM: Creative Block (Writing copy, designing UI/UX, scripting)',
      '01:00 PM: Lunch Break',
      '02:00 PM: Analytics & Outreach (Checking stats, replying to emails/DMs)',
      '04:30 PM: Brainstorming session for next week\'s campaigns',
      '07:00 PM: Gym or Physical activity',
      '10:00 PM: Wind down'
    ],
    imageUrl: 'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&q=80&w=800'
  },
  {
    id: 'monk-mode',
    name: 'The Monk Mode',
    description: 'Best for: Users who want extreme focus and a strict streak to hit massive goals.',
    tasks: [
      '05:00 AM: Wake up & Cold Shower',
      '05:30 AM: 30-min Meditation & Visualization',
      '06:00 AM: 90-min High-Priority Task (The hardest task of the day)',
      '08:00 AM: High-protein breakfast',
      '09:00 AM - 01:00 PM: Uninterrupted Work block (Phone on Airplane mode)',
      '05:00 PM: Intense Workout (Weightlifting or running)',
      '08:00 PM: Digital Sunset (All screens off)',
      '09:30 PM: Sleep strictly'
    ],
    imageUrl: 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?auto=format&fit=crop&q=80&w=800'
  },
  {
    id: 'night-owl',
    name: 'The Night Owl',
    description: 'Best for: Users whose brains work best when the world is asleep.',
    tasks: [
      '10:00 AM: Wake up & slow morning routine',
      '11:30 AM: Admin tasks (Emails, scheduling, easy tasks)',
      '02:00 PM: First main work session',
      '06:00 PM: Workout/Dinner',
      '10:00 PM: Deep Work Block 1 (Peak focus hours begin)',
      '01:00 AM: Break (Stretch, snack)',
      '01:30 AM: Deep Work Block 2',
      '03:00 AM: Review streaks and sleep'
    ],
    imageUrl: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&q=80&w=800'
  },
  {
    id: 'micro-routine',
    name: 'The "1% Better" Micro-Routine',
    description: 'Best for: Weekends or days when the user is feeling low energy but doesn\'t want to lose their streak.',
    tasks: [
      'Anytime: Make the bed (Task 1)',
      'Anytime: Drink 2 liters of water total (Task 2)',
      'Anytime: 10 minutes of outdoor sunlight (Task 3)',
      'Anytime: Read 1 page or watch 1 educational video (Task 4)',
      'Evening: Mark the day as "survived" to maintain the streak.'
    ],
    imageUrl: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&q=80&w=800'
  }
];

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loginMode, setLoginMode] = useState<'user' | 'admin' | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [routines, setRoutines] = useState<Routine[]>(DEFAULT_ROUTINES);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [screenTime, setScreenTime] = useState<number>(0);
  const [coachFeedback, setCoachFeedback] = useState<CoachFeedback | null>(null);
  const [activeTab, setActiveTab] = useState<'today' | 'routines' | 'stats' | 'admin'>('today');
  const [reminderPermission, setReminderPermission] = useState<NotificationPermission>('default');
  const [notifiedTasks, setNotifiedTasks] = useState<Set<string>>(new Set());
  const [showTimePicker, setShowTimePicker] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState('09:00');

  // Admin specific state
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [allTasksCount, setAllTasksCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');

  // --- Notification Setup ---
  useEffect(() => {
    if ('Notification' in window) {
      setReminderPermission(Notification.permission);
    }
  }, []);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    setReminderPermission(permission);
  };

  // --- Reminder Check Loop ---
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const currentTime = format(now, 'HH:mm');
      
      tasks.forEach(task => {
        if (task.reminderTime === currentTime && !task.completed && !notifiedTasks.has(task.id)) {
          triggerNotification(task);
          setNotifiedTasks(prev => new Set(prev).add(task.id));
        }
      });
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [tasks, notifiedTasks]);

  const triggerNotification = (task: Task) => {
    if (reminderPermission === 'granted') {
      new Notification('Mindset Reminder', {
        body: `Time to complete: ${task.title}`,
        icon: '/favicon.ico'
      });
    } else {
      // Fallback: In-app toast/alert (handled by coach feedback or simple state)
      console.log(`REMINDER: ${task.title}`);
    }
  };

  // --- Auth & Profile ---
  useEffect(() => {
    // Test Firestore connection
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        console.log("Firestore connection successful");
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Firestore connection failed: The client is offline. Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const isAdminByEmail = u.email === "prince.88760@gmail.com" || u.email === "0global.marketing.01@gmail.com";
        setIsAdmin(isAdminByEmail);
        if (isAdminByEmail) setActiveTab('admin');
        await syncProfile(u, isAdminByEmail);
      } else {
        setProfile(null);
        setIsAdmin(false);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const syncProfile = async (u: FirebaseUser, isAdminUser: boolean) => {
    try {
      const userRef = doc(db, 'users', u.uid);
      const userSnap = await getDoc(userRef);
      const today = format(startOfToday(), 'yyyy-MM-dd');

      if (userSnap.exists()) {
        const data = userSnap.data() as UserProfile;
        let { streak, lastActiveDate, missedDaysCount } = data;

        const lastDate = parseISO(lastActiveDate);
        const diff = differenceInDays(startOfToday(), lastDate);

        if (diff > 1) {
          if (diff >= 2) {
            streak = 0;
            missedDaysCount += diff;
          } else {
            missedDaysCount += 1;
          }
          
          await updateDoc(userRef, {
            streak,
            lastActiveDate: today,
            missedDaysCount,
            email: u.email,
            displayName: u.displayName,
            role: isAdminUser ? 'admin' : (data.role || 'user')
          });
          setProfile({ ...data, streak, lastActiveDate: today, missedDaysCount, role: isAdminUser ? 'admin' : (data.role || 'user') });
        } else {
          setProfile(data);
        }
      } else {
        const newProfile: UserProfile = {
          uid: u.uid,
          email: u.email || '',
          displayName: u.displayName || '',
          role: isAdminUser ? 'admin' : 'user',
          streak: 0,
          lastActiveDate: today,
          missedDaysCount: 0,
          screenTimeLimit: 3
        };
        await setDoc(userRef, newProfile);
        setProfile(newProfile);
      }
    } catch (error) {
      console.error("Profile sync failed:", error);
      // We still want to stop the loading spinner even if profile sync fails
    } finally {
      setLoading(false);
      setIsLoggingIn(false);
    }
  };

  // --- Real-time Data ---
  useEffect(() => {
    if (!user) return;

    const today = format(startOfToday(), 'yyyy-MM-dd');
    const tasksQuery = query(
      collection(db, 'tasks'),
      where('userId', '==', user.uid),
      where('date', '==', today)
    );

    const unsubscribeTasks = onSnapshot(tasksQuery, (snapshot) => {
      const t = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
      setTasks(t);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'tasks');
    });

    const historyQuery = query(
      collection(db, 'history'),
      where('userId', '==', user.uid),
      orderBy('date', 'desc'),
      limit(7)
    );

    const unsubscribeHistory = onSnapshot(historyQuery, (snapshot) => {
      const h = snapshot.docs.map(doc => doc.data() as HistoryRecord);
      setHistory(h.reverse());
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'history');
    });

    if (isAdmin) {
      const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        setAllUsers(snapshot.docs.map(doc => doc.data() as UserProfile));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'users');
      });
      const unsubscribeTasksAll = onSnapshot(collection(db, 'tasks'), (snapshot) => {
        setAllTasksCount(snapshot.size);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'tasks_all');
      });
      return () => {
        unsubscribeTasks();
        unsubscribeHistory();
        unsubscribeUsers();
        unsubscribeTasksAll();
      };
    }

    return () => {
      unsubscribeTasks();
      unsubscribeHistory();
    };
  }, [user, isAdmin]);

  // --- Actions ---
  const handleLogin = async (mode: 'user' | 'admin') => {
    const provider = new GoogleAuthProvider();
    try {
      setIsLoggingIn(true);
      setLoginMode(mode);
      const result = await signInWithPopup(auth, provider);
      if (mode === 'admin' && result.user.email !== "prince.88760@gmail.com" && result.user.email !== "0global.marketing.01@gmail.com") {
        await signOut(auth);
        alert("Access Denied: You do not have admin privileges. Please log in with the authorized admin email.");
      }
    } catch (error: any) {
      console.error("Login failed:", error);
      setIsLoggingIn(false);
      let errorMessage = "Login failed. Please try again.";
      if (error.code === 'auth/popup-blocked') {
        errorMessage = "Login popup was blocked by your browser. Please allow popups for this site.";
      } else if (error.code === 'auth/unauthorized-domain') {
        errorMessage = "This domain is not authorized for Firebase Authentication. Please add it to the authorized domains in the Firebase Console.";
      } else if (error.message && error.message.includes('identitytoolkit')) {
        errorMessage = "Identity Toolkit API is not enabled or is restricted for your API key. Please enable it in the Google Cloud Console and ensure your API key has permission to use it.";
      } else if (error.message) {
        errorMessage = `Login error: ${error.message}`;
      }
      alert(errorMessage);
    }
  };

  const handleLogout = () => signOut(auth);

  const addTask = async (title: string, routineId?: string, reminderTime?: string) => {
    if (!user || !title.trim()) return;
    const today = format(startOfToday(), 'yyyy-MM-dd');
    
    const taskRef = doc(collection(db, 'tasks'));
    const taskData: any = {
      id: taskRef.id,
      userId: user.uid,
      title: title.trim(),
      completed: false,
      date: today,
    };

    // Only add routineId if it's defined to avoid Firestore error
    if (routineId !== undefined) {
      taskData.routineId = routineId;
    }

    if (reminderTime !== undefined) {
      taskData.reminderTime = reminderTime;
    }

    try {
      await setDoc(taskRef, taskData);
      setNewTaskTitle('');
      setShowTimePicker(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `tasks/${taskRef.id}`);
    }
  };

  const updateTaskReminder = async (taskId: string, time: string) => {
    try {
      const taskRef = doc(db, 'tasks', taskId);
      await updateDoc(taskRef, { reminderTime: time });
      setShowTimePicker(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${taskId}`);
    }
  };

  const toggleTask = async (task: Task) => {
    try {
      const taskRef = doc(db, 'tasks', task.id);
      await updateDoc(taskRef, { completed: !task.completed });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${task.id}`);
    }
    
    // Check if streak should increase
    // This is a bit tricky to do purely on toggle because we need the final state of all tasks
    // We'll handle streak updates at the end of the day or via a "Complete Day" button
  };

  const deleteTask = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'tasks', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tasks/${id}`);
    }
  };

  const applyRoutine = async (routine: Routine) => {
    for (const taskString of routine.tasks) {
      let title = taskString;
      let reminderTime: string | undefined = undefined;

      // Try to extract time like "07:00 AM: Wake up"
      const timeMatch = taskString.match(/^(\d{1,2}:\d{2}\s*(?:AM|PM)):?\s*(.*)$/i);
      if (timeMatch) {
        const timeStr = timeMatch[1];
        title = timeMatch[2];
        
        // Convert "07:00 AM" to "07:00" (24h format for the app's reminder check)
        try {
          const date = parse(timeStr, 'hh:mm a', new Date());
          reminderTime = format(date, 'HH:mm');
        } catch (e) {
          console.error("Failed to parse time:", timeStr);
        }
      }

      await addTask(title, routine.id, reminderTime);
    }
    setActiveTab('today');
  };

  const completeDay = async () => {
    if (!user || !profile || tasks.length === 0) return;

    const completedCount = tasks.filter(t => t.completed).length;
    const rate = (completedCount / tasks.length) * 100;
    const today = format(startOfToday(), 'yyyy-MM-dd');

    let newStreak = profile.streak;
    if (rate >= 80) {
      newStreak += 1;
    }

    try {
      // Save history
      const historyId = `${user.uid}_${today}`;
      await setDoc(doc(db, 'history', historyId), {
        userId: user.uid,
        date: today,
        completionRate: rate,
        screenTime: screenTime,
        streakAtDate: newStreak
      });

      // Update profile
      await updateDoc(doc(db, 'users', user.uid), {
        streak: newStreak,
        lastActiveDate: today
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'history/users');
    }

    setProfile(prev => prev ? { ...prev, streak: newStreak, lastActiveDate: today } : null);
    
    // Get AI Feedback
    const feedback = await getCoachFeedback({
      completionRate: rate,
      streak: newStreak,
      screenTime: screenTime,
      missedDays: profile.missedDaysCount
    }, true);
    setCoachFeedback(feedback);
  };

  // --- UI Helpers ---
  const completionRate = useMemo(() => {
    if (tasks.length === 0) return 0;
    return Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100);
  }, [tasks]);

  if (loading) {
    return (
      <div className="min-h-screen bg-premium-black flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        >
          <BrainCircuit className="w-12 h-12 text-premium-accent" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-premium-black text-premium-silver antialiased">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-premium-black/80 backdrop-blur-xl border-b border-premium-border px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-white p-2 rounded-lg">
            <BrainCircuit className="w-5 h-5 text-black" />
          </div>
          <span className="font-black text-xl tracking-tight text-white uppercase">Mindset</span>
        </div>
        
        <div className="flex items-center gap-6">
          {user ? (
            <>
              <div className="flex items-center gap-4">
                {isAdmin && (
                  <button 
                    onClick={() => setActiveTab('admin')}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-lg transition-all border",
                      activeTab === 'admin' 
                        ? "bg-premium-accent/10 border-premium-accent text-premium-accent shadow-[0_0_15px_rgba(0,229,255,0.2)]" 
                        : "border-premium-border/50 text-premium-silver/40 hover:text-premium-accent hover:border-premium-accent/50"
                    )}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Admin Portal</span>
                  </button>
                )}
                
                <div className="flex items-center gap-2">
                  <button 
                    onClick={requestNotificationPermission}
                    className={cn(
                      "p-2 rounded-lg transition-all",
                      reminderPermission === 'granted' ? "text-premium-accent bg-premium-accent/5" : "text-premium-silver/30 hover:text-premium-silver/60"
                    )}
                  >
                    {reminderPermission === 'granted' ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                  </button>
                  
                  <div className="p-2 text-premium-silver/30">
                    <Smartphone className="w-4 h-4" />
                  </div>

                  <button 
                    onClick={handleLogout}
                    className="p-2 rounded-lg hover:bg-premium-card transition-all text-white/30 hover:text-white"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <button 
                onClick={() => handleLogin('user')}
                disabled={isLoggingIn}
                className={cn(
                  "text-xs font-black uppercase tracking-widest text-premium-silver/60 hover:text-white transition-colors px-4 py-2",
                  isLoggingIn && "opacity-50 cursor-not-allowed"
                )}
              >
                {isLoggingIn && loginMode === 'user' ? 'Logging in...' : 'Login'}
              </button>
              <button 
                onClick={() => handleLogin('admin')}
                disabled={isLoggingIn}
                className={cn(
                  "premium-button py-2 px-4 text-[10px] font-black uppercase tracking-widest border-premium-accent/30 text-premium-accent hover:bg-premium-accent/10",
                  isLoggingIn && "opacity-50 cursor-not-allowed"
                )}
              >
                {isLoggingIn && loginMode === 'admin' ? (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-premium-accent border-t-transparent rounded-full animate-spin" />
                    Authenticating...
                  </div>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Admin Access
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </header>

      <main className={cn("max-w-5xl mx-auto p-8 pb-32", !user && "min-h-[80vh] flex flex-col justify-center")}>
        {!user ? (
          <div className="text-center space-y-12 py-12">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-3xl mx-auto space-y-10 flex flex-col items-center"
            >
              <div className="bg-white w-24 h-24 rounded-3xl flex items-center justify-center mb-4 shadow-[0_0_50px_rgba(255,255,255,0.15)]">
                <BrainCircuit className="text-premium-black w-14 h-14" />
              </div>
              <div className="space-y-6">
                <h1 className="text-7xl md:text-8xl font-black tracking-tighter text-white leading-[0.9]">
                  MASTER YOUR <br />
                  <span className="text-premium-accent">DISCIPLINE</span>
                </h1>
                <p className="text-xl text-premium-silver/60 font-medium max-w-lg mx-auto leading-relaxed">
                  The premium interface for high-performers. Track routines, maintain streaks, and elevate your mindset with AI-powered coaching.
                </p>
              </div>
              <div className="pt-6 w-full flex justify-center">
                <button 
                  onClick={() => handleLogin('user')}
                  disabled={isLoggingIn}
                  className={cn(
                    "premium-button-accent px-16 py-5 text-xl font-black uppercase tracking-[0.2em] shadow-[0_0_40px_rgba(0,229,255,0.4)] hover:scale-105 transition-transform",
                    isLoggingIn && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {isLoggingIn && loginMode === 'user' ? 'Authenticating...' : 'Get Started Now'}
                </button>
              </div>
            </motion.div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-32">
              {[
                { title: 'AI Coaching', desc: 'Personalized feedback based on your performance.', icon: <BrainCircuit className="w-6 h-6" /> },
                { title: 'Streak Tracking', desc: 'Visual momentum to keep you consistent.', icon: <Flame className="w-6 h-6" /> },
                { title: 'Routine Engine', desc: 'Build and apply high-performance routines.', icon: <Plus className="w-6 h-6" /> },
              ].map((feature, i) => (
                <motion.div 
                  key={i} 
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ 
                    duration: 0.8, 
                    delay: i * 0.15,
                    ease: [0.21, 0.47, 0.32, 0.98] 
                  }}
                  className="premium-card text-left space-y-4 border-premium-border/50"
                >
                  <div className="p-3 bg-premium-accent/10 w-fit rounded-xl text-premium-accent">
                    {feature.icon}
                  </div>
                  <h3 className="font-black text-white uppercase tracking-widest text-sm">{feature.title}</h3>
                  <p className="text-sm text-premium-silver/40 leading-relaxed">{feature.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Stats Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <motion.div 
            whileHover={{ y: -4 }}
            className="premium-card relative overflow-hidden"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black text-premium-silver/20 uppercase tracking-[0.3em]">Streak</span>
              <div className="p-1 bg-premium-gold/5 rounded-full">
                <Flame className={cn("w-3 h-3", profile?.streak ? "text-premium-gold" : "text-premium-silver/10")} />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-6xl font-black text-white leading-none">{profile?.streak || 0}</span>
              <span className="text-[10px] font-black text-premium-silver/30 uppercase tracking-[0.2em] mt-2">Days</span>
            </div>
          </motion.div>

          <motion.div 
            whileHover={{ y: -4 }}
            className="premium-card relative"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black text-premium-silver/20 uppercase tracking-[0.3em]">Daily</span>
              <div className="streak-badge py-1 px-3 flex items-center gap-2">
                <Flame className="w-3 h-3 fill-current" />
                <span className="text-[9px] font-black uppercase tracking-widest">{profile?.streak || 0} Day Streak</span>
              </div>
            </div>
            <div className="flex flex-col mb-4">
              <div className="flex items-baseline gap-1">
                <span className="text-6xl font-black text-white leading-none">{completionRate}</span>
                <span className="text-2xl font-black text-white">%</span>
              </div>
              <span className="text-[10px] font-black text-premium-silver/30 uppercase tracking-[0.2em] mt-2">Target</span>
            </div>
            <div className="w-full bg-premium-dark h-1.5 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${completionRate}%` }}
                className="h-full bg-premium-accent shadow-[0_0_15px_rgba(0,229,255,0.4)]"
              />
            </div>
          </motion.div>

          <motion.div 
            whileHover={{ y: -4 }}
            className="premium-card"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black text-premium-silver/20 uppercase tracking-[0.3em]">Focus</span>
              <div className="p-1 bg-blue-500/5 rounded-lg">
                <Smartphone className="w-3 h-3 text-blue-400/50" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <input 
                  type="number" 
                  value={screenTime}
                  onChange={(e) => setScreenTime(Number(e.target.value))}
                  className="text-6xl font-black bg-transparent w-24 outline-none text-white leading-none"
                  min="0"
                  max="24"
                />
                <span className="text-xs font-black text-premium-silver/30 uppercase tracking-[0.2em]">Hours</span>
              </div>
              <div className="w-8 h-12 border-2 border-white/10 rounded-full flex items-center justify-center">
                <div className={cn("w-4 h-4 bg-white rounded-full transition-all", screenTime > 0 ? "opacity-100 scale-100" : "opacity-10 scale-50")} />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Warning for skipped day */}
        {profile && differenceInDays(startOfToday(), parseISO(profile.lastActiveDate)) === 1 && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-orange-50 border border-orange-200 text-orange-800 p-4 rounded-2xl mb-8 flex items-center gap-3"
          >
            <AlertTriangle className="w-6 h-6 shrink-0" />
            <p className="font-medium">⚠️ You skipped yesterday. Stay consistent today or your streak will break.</p>
          </motion.div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-10 bg-premium-dark p-1 rounded-2xl w-fit border border-premium-border">
          <button 
            onClick={() => setActiveTab('today')}
            className={cn(
              "px-10 py-3 rounded-xl text-xs font-black uppercase tracking-[0.2em] transition-all",
              activeTab === 'today' ? "bg-premium-card text-white border border-white/5 shadow-2xl" : "text-premium-silver/20 hover:text-premium-silver/40"
            )}
          >
            Today
          </button>
          <button 
            onClick={() => setActiveTab('routines')}
            className={cn(
              "px-10 py-3 rounded-xl text-xs font-black uppercase tracking-[0.2em] transition-all",
              activeTab === 'routines' ? "bg-premium-card text-white border border-white/5 shadow-2xl" : "text-premium-silver/20 hover:text-premium-silver/40"
            )}
          >
            Routines
          </button>
          <button 
            onClick={() => setActiveTab('stats')}
            className={cn(
              "px-10 py-3 rounded-xl text-xs font-black uppercase tracking-[0.2em] transition-all",
              activeTab === 'stats' ? "bg-premium-card text-white border border-white/5 shadow-2xl" : "text-premium-silver/20 hover:text-premium-silver/40"
            )}
          >
            Stats
          </button>
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'today' && (
            <motion.div 
              key="today"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-6"
            >
              {/* Task Input */}
              <div className="space-y-4">
                <div className="flex gap-4">
                  <input 
                    type="text" 
                    placeholder="Enter a new discipline task..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addTask(newTaskTitle, undefined, selectedTime)}
                    className="premium-input flex-1 py-4 px-6 text-lg"
                  />
                  <button 
                    onClick={() => addTask(newTaskTitle, undefined, selectedTime)}
                    className="premium-button-accent px-8"
                  >
                    <Plus className="w-6 h-6" />
                  </button>
                </div>
                <div className="flex items-center gap-4 px-2">
                  <div className="flex items-center gap-2 text-premium-silver/40">
                    <Clock className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Reminder</span>
                  </div>
                  <input 
                    type="time" 
                    value={selectedTime}
                    onChange={(e) => setSelectedTime(e.target.value)}
                    className="bg-premium-dark border border-premium-border rounded-lg px-3 py-1 text-sm font-bold text-premium-accent"
                  />
                </div>
              </div>

              {/* Task List */}
              <div className="space-y-4">
                {tasks.length === 0 ? (
                  <div className="premium-card text-center py-16 text-premium-silver/30">
                    <p className="text-lg font-medium">No tasks scheduled for today.</p>
                    <p className="text-sm">Apply a routine or add a custom task to begin.</p>
                  </div>
                ) : (
                  tasks.map((task) => (
                    <motion.div 
                      layout
                      key={task.id}
                      className={cn(
                        "group flex items-center justify-between p-6 rounded-2xl border transition-all relative overflow-hidden",
                        task.completed 
                          ? "bg-premium-dark/50 border-premium-border/50 opacity-40" 
                          : "bg-premium-card border-premium-border shadow-xl"
                      )}
                    >
                      <div className="flex items-center gap-5 flex-1">
                        <button onClick={() => toggleTask(task)} className="relative z-10">
                          {task.completed ? (
                            <div className="w-7 h-7 bg-premium-accent rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(0,229,255,0.3)]">
                              <CheckCircle2 className="w-5 h-5 text-premium-black" />
                            </div>
                          ) : (
                            <div className="w-7 h-7 border-2 border-premium-border rounded-full group-hover:border-premium-accent transition-colors" />
                          )}
                        </button>
                        <div className="flex flex-col">
                          <span className={cn("text-lg font-bold tracking-tight text-white transition-all", task.completed && "line-through text-premium-silver/30")}>
                            {task.title}
                          </span>
                          {task.reminderTime && (
                            <div className="flex items-center gap-2 text-[10px] text-premium-accent font-black uppercase tracking-[0.1em] mt-1">
                              <Bell className="w-3 h-3" />
                              {task.reminderTime}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 relative z-10">
                        <button 
                          onClick={() => setShowTimePicker(showTimePicker === task.id ? null : task.id)}
                          className="p-2.5 text-premium-silver/30 hover:text-premium-accent transition-colors"
                        >
                          <Clock className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => deleteTask(task.id)}
                          className="p-2.5 text-premium-silver/30 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                      
                      {/* Inline Time Picker */}
                      <AnimatePresence>
                        {showTimePicker === task.id && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="absolute inset-0 z-20 bg-premium-card flex items-center justify-center px-6"
                          >
                            <div className="flex items-center gap-6 w-full">
                              <span className="text-[10px] font-black uppercase tracking-widest text-premium-silver/40">Set Reminder Time</span>
                              <input 
                                type="time" 
                                defaultValue={task.reminderTime || '09:00'}
                                onBlur={(e) => updateTaskReminder(task.id, e.target.value)}
                                className="premium-input flex-1 py-2"
                                autoFocus
                              />
                              <button onClick={() => setShowTimePicker(null)} className="text-white font-bold text-xs uppercase tracking-widest">Cancel</button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))
                )}
              </div>

              {tasks.length > 0 && (
                <button 
                  onClick={completeDay}
                  className="premium-button-accent w-full py-5 text-xl mt-8 shadow-[0_10px_30px_rgba(0,229,255,0.2)]"
                >
                  Finalize Daily Discipline
                </button>
              )}

              {/* Coach Feedback */}
              {coachFeedback && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white text-premium-black p-10 rounded-[2.5rem] space-y-8 shadow-[0_20px_50px_rgba(255,255,255,0.1)]"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-premium-black rounded-2xl">
                      <BrainCircuit className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-2xl font-black uppercase tracking-tighter">AI Analysis</h3>
                  </div>
                  <p className="text-xl leading-relaxed font-medium italic opacity-80">"{coachFeedback.feedback}"</p>
                  <div className="space-y-4">
                    <h4 className="font-black uppercase tracking-[0.3em] text-[10px] opacity-40">Strategic Directives</h4>
                    <ul className="space-y-3">
                      {coachFeedback.tips.map((tip, i) => (
                        <li key={i} className="flex items-start gap-4 text-lg">
                          <div className="w-6 h-6 rounded-full bg-premium-black text-white flex items-center justify-center text-xs font-bold shrink-0 mt-1">
                            {i + 1}
                          </div>
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === 'routines' && (
            <motion.div 
              key="routines"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-6"
            >
              {routines.map((routine) => (
                <div 
                  key={routine.id}
                  className="premium-card overflow-hidden flex flex-col p-0"
                >
                  {routine.imageUrl && (
                    <div className="h-56 w-full relative">
                      <img 
                        src={routine.imageUrl} 
                        alt={routine.name} 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-premium-black via-premium-black/20 to-transparent" />
                      <div className="absolute bottom-6 left-6">
                        <h3 className="text-2xl font-black text-white uppercase tracking-tighter">{routine.name}</h3>
                      </div>
                    </div>
                  )}
                  <div className="p-8 flex-1 flex flex-col justify-between">
                    <div>
                      {!routine.imageUrl && <h3 className="text-2xl font-black mb-4 uppercase tracking-tighter">{routine.name}</h3>}
                      <p className="text-premium-silver/40 text-sm mb-6 leading-relaxed">{routine.description}</p>
                      <ul className="space-y-3 mb-8">
                        {routine.tasks.map((t, i) => (
                          <li key={i} className="text-sm flex items-center gap-3 text-premium-silver/60 font-medium">
                            <div className="w-1.5 h-1.5 rounded-full bg-premium-accent shadow-[0_0_8px_rgba(0,229,255,0.5)]" />
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <button 
                      onClick={() => applyRoutine(routine)}
                      className="premium-button w-full py-4 uppercase tracking-widest text-xs font-black"
                    >
                      Initialize Routine
                    </button>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {activeTab === 'stats' && (
            <motion.div 
              key="stats"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-8"
            >
              <div className="premium-card">
                <h3 className="text-sm font-black mb-8 flex items-center gap-3 uppercase tracking-widest text-white">
                  <BarChart3 className="w-5 h-5 text-premium-accent" />
                  Performance Analytics
                </h3>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={history}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#222" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(val) => format(parseISO(val), 'MMM d')} 
                        stroke="#444"
                        fontSize={10}
                        fontWeight="bold"
                      />
                      <YAxis stroke="#444" fontSize={10} fontWeight="bold" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#111',
                          border: '1px solid #222',
                          borderRadius: '12px',
                          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                          color: '#fff'
                        }}
                      />
                      <Bar dataKey="completionRate" fill="#00E5FF" radius={[6, 6, 0, 0]} name="Completion %" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="premium-card">
                <h3 className="text-sm font-black mb-8 flex items-center gap-3 uppercase tracking-widest text-white">
                  <Smartphone className="w-5 h-5 text-blue-400" />
                  Focus Retention
                </h3>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#222" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(val) => format(parseISO(val), 'MMM d')} 
                        stroke="#444"
                        fontSize={10}
                        fontWeight="bold"
                      />
                      <YAxis stroke="#444" fontSize={10} fontWeight="bold" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#111',
                          border: '1px solid #222',
                          borderRadius: '12px',
                          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                          color: '#fff'
                        }}
                      />
                      <Line type="monotone" dataKey="screenTime" stroke="#3b82f6" strokeWidth={4} dot={{ r: 6, fill: '#3b82f6', strokeWidth: 0 }} name="Hours" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'admin' && isAdmin && (
            <motion.div 
              key="admin"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="premium-card">
                  <div className="flex items-center gap-3 mb-4 text-premium-accent">
                    <Users className="w-5 h-5" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Total Users</span>
                  </div>
                  <div className="text-4xl font-black text-white">{allUsers.length}</div>
                </div>
                <div className="premium-card">
                  <div className="flex items-center gap-3 mb-4 text-premium-gold">
                    <Activity className="w-5 h-5" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Active Tasks</span>
                  </div>
                  <div className="text-4xl font-black text-white">{allTasksCount}</div>
                </div>
                <div className="premium-card">
                  <div className="flex items-center gap-3 mb-4 text-green-400">
                    <ShieldCheck className="w-5 h-5" />
                    <span className="text-[10px] font-black uppercase tracking-widest">System Health</span>
                  </div>
                  <div className="text-4xl font-black text-white">OPTIMAL</div>
                </div>
              </div>

              <div className="premium-card">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                  <h3 className="text-sm font-black uppercase tracking-widest text-white">User Management</h3>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-premium-silver/30" />
                    <input 
                      type="text" 
                      placeholder="Search users..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="premium-input pl-12 py-2 text-sm w-full md:w-64"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-premium-border">
                        <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-premium-silver/30">User</th>
                        <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-premium-silver/30">Role</th>
                        <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-premium-silver/30">Streak</th>
                        <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-premium-silver/30">Last Active</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-premium-border/50">
                      {allUsers
                        .filter(u => u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) || u.email?.toLowerCase().includes(searchTerm.toLowerCase()))
                        .map((u) => (
                        <tr key={u.uid} className="group hover:bg-premium-dark/30 transition-colors">
                          <td className="py-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-white">{u.displayName || 'Anonymous'}</span>
                              <span className="text-xs text-premium-silver/30">{u.email}</span>
                            </div>
                          </td>
                          <td className="py-4">
                            <span className={cn(
                              "text-[10px] font-black px-2 py-1 rounded uppercase tracking-widest",
                              u.role === 'admin' ? "bg-premium-accent/10 text-premium-accent" : "bg-premium-silver/10 text-premium-silver/40"
                            )}>
                              {u.role || 'user'}
                            </span>
                          </td>
                          <td className="py-4">
                            <div className="flex items-center gap-2 font-bold text-premium-gold">
                              <Flame className="w-4 h-4" />
                              {u.streak}
                            </div>
                          </td>
                          <td className="py-4 text-xs text-premium-silver/40 font-medium">
                            {u.lastActiveDate}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </>
      )}

        {/* Footer Contact Info */}
        <footer className="mt-24 pt-12 border-t border-premium-border text-center space-y-6">
          <div className="space-y-2">
            <p className="text-[10px] font-black text-premium-silver/20 uppercase tracking-[0.4em]">Strategic Support</p>
            <div className="flex flex-col md:flex-row items-center justify-center gap-8 text-sm">
              <a href="mailto:0global.marketing.01@gmail.com" className="group flex items-center gap-3 text-premium-silver/40 hover:text-white transition-all">
                <div className="p-2 bg-premium-card rounded-lg group-hover:bg-premium-accent/10 transition-all">
                  <Bell className="w-4 h-4" />
                </div>
                <span className="font-bold tracking-tight">0global.marketing.01@gmail.com</span>
              </a>
              <a href="tel:9871888760" className="group flex items-center gap-3 text-premium-silver/40 hover:text-white transition-all">
                <div className="p-2 bg-premium-card rounded-lg group-hover:bg-premium-accent/10 transition-all">
                  <Smartphone className="w-4 h-4" />
                </div>
                <span className="font-bold tracking-tight">98718-88760</span>
              </a>
            </div>
          </div>
          <p className="text-[10px] text-premium-silver/10 font-bold uppercase tracking-widest">© 2026 Mindset Premium Interface</p>
        </footer>
      </main>

      {/* Bottom Navigation (Mobile Friendly) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-premium-black/80 backdrop-blur-2xl border-t border-premium-border px-8 py-6 flex justify-around md:hidden z-50">
        <button onClick={() => setActiveTab('today')} className={cn("p-2 transition-all", activeTab === 'today' ? "text-premium-accent scale-110" : "text-premium-silver/30")}>
          <CheckCircle2 className="w-7 h-7" />
        </button>
        <button onClick={() => setActiveTab('routines')} className={cn("p-2 transition-all", activeTab === 'routines' ? "text-premium-accent scale-110" : "text-premium-silver/30")}>
          <Plus className="w-7 h-7" />
        </button>
        <button onClick={() => setActiveTab('stats')} className={cn("p-2 transition-all", activeTab === 'stats' ? "text-premium-accent scale-110" : "text-premium-silver/30")}>
          <BarChart3 className="w-7 h-7" />
        </button>
      </nav>
      <Chatbot isLoggedIn={!!user} userName={user?.displayName} />
    </div>
  );
}
