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
  parseISO
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
  Clock
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
    id: 'morning',
    name: 'Morning Discipline',
    description: 'Start your day with focus and energy.',
    tasks: ['Wake up at 6 AM', 'Hydrate (500ml)', '15m Meditation', 'Plan top 3 tasks'],
    imageUrl: 'https://picsum.photos/seed/morning-meditation/800/600'
  },
  {
    id: 'study',
    name: 'Deep Work / Study',
    description: 'Maximize cognitive performance.',
    tasks: ['Phone in other room', '45m Focus session', '5m Stretch', 'Review notes'],
    imageUrl: 'https://picsum.photos/seed/focus-study/800/600'
  },
  {
    id: 'fitness',
    name: 'Physical Strength',
    description: 'Maintain your body for your mind.',
    tasks: ['30m Workout', 'Protein-rich meal', 'Mobility work'],
    imageUrl: 'https://picsum.photos/seed/workout-strength/800/600'
  },
  {
    id: 'sleep',
    name: 'Sleep Hygiene',
    description: 'Recover for tomorrow.',
    tasks: ['No screens 1h before bed', 'Read 10 pages', 'Cool room temp'],
    imageUrl: 'https://picsum.photos/seed/sleep-peace/800/600'
  }
];

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [routines, setRoutines] = useState<Routine[]>(DEFAULT_ROUTINES);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [screenTime, setScreenTime] = useState<number>(0);
  const [coachFeedback, setCoachFeedback] = useState<CoachFeedback | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'today' | 'routines' | 'stats'>('today');
  const [reminderPermission, setReminderPermission] = useState<NotificationPermission>('default');
  const [notifiedTasks, setNotifiedTasks] = useState<Set<string>>(new Set());
  const [showTimePicker, setShowTimePicker] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState('09:00');

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
        await syncProfile(u);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const syncProfile = async (u: FirebaseUser) => {
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
          // Skipped more than 1 day
          if (diff >= 2) {
            streak = 0;
            missedDaysCount += diff;
          } else {
            // Skipped exactly 1 day - warning logic handled in UI
            missedDaysCount += 1;
          }
          
          await updateDoc(userRef, {
            streak,
            lastActiveDate: today,
            missedDaysCount
          });
          setProfile({ ...data, streak, lastActiveDate: today, missedDaysCount });
        } else {
          setProfile(data);
        }
      } else {
        const newProfile: UserProfile = {
          uid: u.uid,
          streak: 0,
          lastActiveDate: today,
          missedDaysCount: 0,
          screenTimeLimit: 3
        };
        await setDoc(userRef, newProfile);
        setProfile(newProfile);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${u.uid}`);
    }
    setLoading(false);
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

    return () => {
      unsubscribeTasks();
      unsubscribeHistory();
    };
  }, [user]);

  // --- Actions ---
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
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
    for (const taskTitle of routine.tasks) {
      await addTask(taskTitle, routine.id);
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
    }, isDarkMode);
    setCoachFeedback(feedback);
  };

  // --- UI Helpers ---
  const completionRate = useMemo(() => {
    if (tasks.length === 0) return 0;
    return Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100);
  }, [tasks]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        >
          <BrainCircuit className="w-12 h-12 text-neutral-400" />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full space-y-8"
        >
          <div className="space-y-2">
            <div className="bg-neutral-900 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <BrainCircuit className="text-white w-10 h-10" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-neutral-900">Mindset AI</h1>
            <p className="text-neutral-500">Your disciplined productivity coach.</p>
          </div>
          
          <button 
            onClick={handleLogin}
            className="w-full bg-neutral-900 text-white py-4 rounded-xl font-semibold hover:bg-neutral-800 transition-colors flex items-center justify-center gap-3"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
            Continue with Google
          </button>
          
          <p className="text-xs text-neutral-400">
            Build discipline. Maintain streaks. Master focus.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={cn(
      "min-h-screen transition-colors duration-500",
      isDarkMode ? "bg-neutral-950 text-neutral-100" : "bg-neutral-50 text-neutral-900"
    )}>
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-neutral-900 dark:bg-neutral-100 p-2 rounded-lg">
            <BrainCircuit className="w-5 h-5 text-white dark:text-neutral-900" />
          </div>
          <span className="font-bold text-lg tracking-tight">Mindset</span>
        </div>
        
        <div className="flex items-center gap-4">
          {reminderPermission !== 'granted' && (
            <button 
              onClick={requestNotificationPermission}
              className="p-2 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors text-orange-500"
              title="Enable Reminders"
            >
              <BellOff className="w-5 h-5" />
            </button>
          )}
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button 
            onClick={handleLogout}
            className="p-2 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 pb-32">
        {/* Streak & Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <motion.div 
            whileHover={{ y: -2 }}
            className="bg-white dark:bg-neutral-900 p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-sm"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Current Streak</span>
              <Flame className={cn("w-6 h-6", profile?.streak ? "text-orange-500" : "text-neutral-300")} />
            </div>
            <div className="text-4xl font-black">{profile?.streak || 0} <span className="text-lg font-normal text-neutral-400">Days</span></div>
          </motion.div>

          <motion.div 
            whileHover={{ y: -2 }}
            className="bg-white dark:bg-neutral-900 p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-sm"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Today's Progress</span>
              <CheckCircle2 className="w-6 h-6 text-green-500" />
            </div>
            <div className="text-4xl font-black">{completionRate}%</div>
            <div className="w-full bg-neutral-100 dark:bg-neutral-800 h-2 rounded-full mt-3 overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${completionRate}%` }}
                className="h-full bg-green-500"
              />
            </div>
          </motion.div>

          <motion.div 
            whileHover={{ y: -2 }}
            className="bg-white dark:bg-neutral-900 p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-sm"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Screen Time</span>
              <Smartphone className="w-6 h-6 text-blue-500" />
            </div>
            <div className="flex items-end gap-2">
              <input 
                type="number" 
                value={screenTime}
                onChange={(e) => setScreenTime(Number(e.target.value))}
                className="text-4xl font-black bg-transparent w-20 outline-none"
              />
              <span className="text-lg font-normal text-neutral-400 mb-1">Hrs</span>
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
        <div className="flex gap-2 mb-8 bg-neutral-100 dark:bg-neutral-900 p-1 rounded-2xl w-fit">
          <button 
            onClick={() => setActiveTab('today')}
            className={cn(
              "px-6 py-2 rounded-xl text-sm font-semibold transition-all",
              activeTab === 'today' ? "bg-white dark:bg-neutral-800 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            )}
          >
            Today
          </button>
          <button 
            onClick={() => setActiveTab('routines')}
            className={cn(
              "px-6 py-2 rounded-xl text-sm font-semibold transition-all",
              activeTab === 'routines' ? "bg-white dark:bg-neutral-800 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            )}
          >
            Routines
          </button>
          <button 
            onClick={() => setActiveTab('stats')}
            className={cn(
              "px-6 py-2 rounded-xl text-sm font-semibold transition-all",
              activeTab === 'stats' ? "bg-white dark:bg-neutral-800 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
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
              <div className="space-y-3">
                <div className="flex gap-3">
                  <input 
                    type="text" 
                    placeholder="Add a task..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addTask(newTaskTitle, undefined, selectedTime)}
                    className="flex-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl px-6 py-4 outline-none focus:ring-2 ring-neutral-900 dark:ring-neutral-100 transition-all"
                  />
                  <button 
                    onClick={() => addTask(newTaskTitle, undefined, selectedTime)}
                    className="bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-6 rounded-2xl font-bold hover:opacity-90 transition-opacity"
                  >
                    <Plus className="w-6 h-6" />
                  </button>
                </div>
                <div className="flex items-center gap-3 px-2">
                  <Clock className="w-4 h-4 text-neutral-400" />
                  <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Set Reminder:</span>
                  <input 
                    type="time" 
                    value={selectedTime}
                    onChange={(e) => setSelectedTime(e.target.value)}
                    className="bg-transparent text-sm font-bold outline-none border-b border-neutral-200 dark:border-neutral-800"
                  />
                </div>
              </div>

              {/* Task List */}
              <div className="space-y-3">
                {tasks.length === 0 ? (
                  <div className="text-center py-12 text-neutral-400">
                    <p>No tasks for today. Start by adding one or applying a routine.</p>
                  </div>
                ) : (
                  tasks.map((task) => (
                    <motion.div 
                      layout
                      key={task.id}
                      className={cn(
                        "group flex items-center justify-between p-5 rounded-2xl border transition-all",
                        task.completed 
                          ? "bg-neutral-50 dark:bg-neutral-900/50 border-neutral-100 dark:border-neutral-800 opacity-60" 
                          : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-sm"
                      )}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <button onClick={() => toggleTask(task)}>
                          {task.completed ? (
                            <CheckCircle2 className="w-6 h-6 text-green-500" />
                          ) : (
                            <Circle className="w-6 h-6 text-neutral-300 group-hover:text-neutral-400" />
                          )}
                        </button>
                        <div className="flex flex-col">
                          <span className={cn("font-medium", task.completed && "line-through")}>
                            {task.title}
                          </span>
                          {task.reminderTime && (
                            <div className="flex items-center gap-1 text-[10px] text-neutral-400 font-bold uppercase tracking-tighter">
                              <Bell className="w-3 h-3" />
                              {task.reminderTime}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setShowTimePicker(showTimePicker === task.id ? null : task.id)}
                          className="p-2 text-neutral-300 hover:text-neutral-600 dark:hover:text-neutral-100 transition-colors"
                        >
                          <Clock className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => deleteTask(task.id)}
                          className="p-2 text-neutral-300 hover:text-red-500 transition-colors"
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
                            className="absolute top-full left-0 right-0 z-20 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-4 mt-2 shadow-xl"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold uppercase">Change Reminder</span>
                              <input 
                                type="time" 
                                defaultValue={task.reminderTime || '09:00'}
                                onBlur={(e) => updateTaskReminder(task.id, e.target.value)}
                                className="bg-neutral-100 dark:bg-neutral-900 px-3 py-1 rounded-lg text-sm font-bold"
                              />
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
                  className="w-full bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 py-4 rounded-2xl font-bold text-lg shadow-lg hover:opacity-90 transition-all"
                >
                  Complete Day
                </button>
              )}

              {/* Coach Feedback */}
              {coachFeedback && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 p-8 rounded-3xl space-y-6"
                >
                  <div className="flex items-center gap-3">
                    <BrainCircuit className="w-8 h-8" />
                    <h3 className="text-xl font-bold">Coach Feedback</h3>
                  </div>
                  <p className="text-lg leading-relaxed opacity-90 italic">"{coachFeedback.feedback}"</p>
                  <div className="space-y-3">
                    <h4 className="font-bold uppercase tracking-widest text-xs opacity-60">Actionable Tips</h4>
                    <ul className="space-y-2">
                      {coachFeedback.tips.map((tip, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <ChevronRight className="w-5 h-5 shrink-0 mt-0.5" />
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
                  className="bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-sm overflow-hidden flex flex-col"
                >
                  {routine.imageUrl && (
                    <div className="h-40 w-full relative">
                      <img 
                        src={routine.imageUrl} 
                        alt={routine.name} 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-4">
                        <h3 className="text-xl font-bold text-white">{routine.name}</h3>
                      </div>
                    </div>
                  )}
                  <div className="p-6 flex-1 flex flex-col justify-between">
                    <div>
                      {!routine.imageUrl && <h3 className="text-xl font-bold mb-2">{routine.name}</h3>}
                      <p className="text-neutral-500 text-sm mb-4">{routine.description}</p>
                      <ul className="space-y-2 mb-6">
                        {routine.tasks.map((t, i) => (
                          <li key={i} className="text-sm flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                            <div className="w-1.5 h-1.5 rounded-full bg-neutral-300" />
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <button 
                      onClick={() => applyRoutine(routine)}
                      className="w-full py-3 rounded-xl border-2 border-neutral-900 dark:border-neutral-100 font-bold hover:bg-neutral-900 hover:text-white dark:hover:bg-neutral-100 dark:hover:text-neutral-900 transition-all"
                    >
                      Apply Routine
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
              <div className="bg-white dark:bg-neutral-900 p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Weekly Performance
                </h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={history}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? "#333" : "#eee"} />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(val) => format(parseISO(val), 'MMM d')} 
                        stroke={isDarkMode ? "#666" : "#999"}
                        fontSize={12}
                      />
                      <YAxis stroke={isDarkMode ? "#666" : "#999"} fontSize={12} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: isDarkMode ? '#171717' : '#fff',
                          border: 'none',
                          borderRadius: '12px',
                          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
                        }}
                      />
                      <Bar dataKey="completionRate" fill="#10b981" radius={[4, 4, 0, 0]} name="Completion %" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white dark:bg-neutral-900 p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                  <Smartphone className="w-5 h-5" />
                  Screen Time Trend
                </h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? "#333" : "#eee"} />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(val) => format(parseISO(val), 'MMM d')} 
                        stroke={isDarkMode ? "#666" : "#999"}
                        fontSize={12}
                      />
                      <YAxis stroke={isDarkMode ? "#666" : "#999"} fontSize={12} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: isDarkMode ? '#171717' : '#fff',
                          border: 'none',
                          borderRadius: '12px',
                          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
                        }}
                      />
                      <Line type="monotone" dataKey="screenTime" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} name="Hours" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer Contact Info */}
        <footer className="mt-16 pt-8 border-t border-neutral-200 dark:border-neutral-800 text-center space-y-2">
          <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Contact Coach</p>
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 text-sm text-neutral-600 dark:text-neutral-400">
            <a href="mailto:prince.88760@gmail.com" className="hover:text-neutral-900 dark:hover:text-white transition-colors font-medium">
              prince.88760@gmail.com
            </a>
            <span className="hidden md:inline opacity-30">|</span>
            <a href="tel:9871888760" className="hover:text-neutral-900 dark:hover:text-white transition-colors font-medium">
              98718-88760
            </a>
          </div>
        </footer>
      </main>

      {/* Bottom Navigation (Mobile Friendly) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl border-t border-neutral-200 dark:border-neutral-800 px-6 py-4 flex justify-around md:hidden">
        <button onClick={() => setActiveTab('today')} className={cn("p-2", activeTab === 'today' ? "text-neutral-900 dark:text-white" : "text-neutral-400")}>
          <CheckCircle2 className="w-6 h-6" />
        </button>
        <button onClick={() => setActiveTab('routines')} className={cn("p-2", activeTab === 'routines' ? "text-neutral-900 dark:text-white" : "text-neutral-400")}>
          <Plus className="w-6 h-6" />
        </button>
        <button onClick={() => setActiveTab('stats')} className={cn("p-2", activeTab === 'stats' ? "text-neutral-900 dark:text-white" : "text-neutral-400")}>
          <BarChart3 className="w-6 h-6" />
        </button>
      </nav>
    </div>
  );
}
