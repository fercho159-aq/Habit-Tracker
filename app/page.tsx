'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import useSWR, { mutate } from 'swr';
import { Play, Pause, Square, Plus, X, StopCircle, Clock, RotateCcw, Moon, Sun, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Fetcher for SWR
const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Failed to fetch');
  }
  return res.json();
};

interface Habit {
  id: number;
  name: string;
  icon: string;
  color: string;
  target_minutes: number;
}

interface LocalHabitState extends Habit {
  remainingTime: number; // in seconds
}

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function Home() {
  const { data: serverHabits } = useSWR<Habit[]>('/api/habits', fetcher);

  const [localHabits, setLocalHabits] = useState<LocalHabitState[]>([]);
  const [activeHabitId, setActiveHabitId] = useState<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // Initialize Theme
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      // Default to Dark if no preference
      setTheme('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  // 1. Initialize State (Merge Server Habits + LocalStorage)
  useEffect(() => {
    if (!serverHabits) return;

    const savedData = localStorage.getItem('my_habits_timer');
    const savedHabits: Record<number, number> = savedData ? JSON.parse(savedData) : {};

    // Map server habits to local state, preserving saved time if exists
    const mergedHabits = serverHabits.map(h => ({
      ...h,
      remainingTime: savedHabits[h.id] !== undefined ? savedHabits[h.id] : h.target_minutes * 60
    }));

    setLocalHabits(mergedHabits);
    setIsLoaded(true);
  }, [serverHabits]);

  // 2. Persistence: Save to LocalStorage whenever time changes
  useEffect(() => {
    if (!isLoaded || localHabits.length === 0) return;

    const timeMap = localHabits.reduce((acc, h) => {
      acc[h.id] = h.remainingTime;
      return acc;
    }, {} as Record<number, number>);

    localStorage.setItem('my_habits_timer', JSON.stringify(timeMap));
  }, [localHabits, isLoaded]);

  // 3. Timer Logic (The "Tick")
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (activeHabitId) {
      interval = setInterval(() => {
        setLocalHabits(prev =>
          prev.map(habit => {
            if (habit.id === activeHabitId && habit.remainingTime > 0) {
              return { ...habit, remainingTime: habit.remainingTime - 1 };
            }
            return habit;
          })
        );
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [activeHabitId]);


  const toggleHabit = (id: number) => {
    if (activeHabitId === id) {
      setActiveHabitId(null); // Stop if clicking the same one
    } else {
      setActiveHabitId(id); // Switch instantly
    }
  };

  const resetHabit = (e: React.MouseEvent, id: number, initialMinutes: number) => {
    e.stopPropagation();
    setLocalHabits(prev => prev.map(h => h.id === id ? { ...h, remainingTime: initialMinutes * 60 } : h));
    if (activeHabitId === id) setActiveHabitId(null);
  };

  // Create Habit Form State
  const [isCreating, setIsCreating] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const [newHabitIcon, setNewHabitIcon] = useState('✨');
  const [newHabitColor, setNewHabitColor] = useState('#0A84FF');
  const [newHabitDuration, setNewHabitDuration] = useState(30);

  const createHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/habits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newHabitName,
        icon: newHabitIcon,
        color: newHabitColor,
        target_minutes: newHabitDuration
      }),
    });
    setIsCreating(false);
    mutate('/api/habits'); // Refresh list
    setNewHabitName('');
  };

  const deleteHabit = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this habit?')) return;

    await fetch(`/api/habits/${id}`, {
      method: 'DELETE',
    });

    if (activeHabitId === id) setActiveHabitId(null);
    mutate('/api/habits'); // Refresh list
  };

  // Visual Computation for Active Timer
  const activeHabit = localHabits.find(h => h.id === activeHabitId);
  const circleRadius = 120;
  const circumference = 2 * Math.PI * circleRadius;

  let progress = 0;
  if (activeHabit) {
    const totalSeconds = activeHabit.target_minutes * 60;
    progress = totalSeconds > 0 ? ((totalSeconds - activeHabit.remainingTime) / totalSeconds) * 100 : 0;
  }

  if (!isLoaded && !serverHabits) return <div className="text-center mt-20 text-gray-500">Loading habits...</div>;

  return (
    <main className="min-h-screen p-6 md:p-12 max-w-5xl mx-auto flex flex-col items-center font-sans tracking-tight transition-colors duration-500">

      {/* Theme Toggle in Header */}
      <div className="absolute top-6 right-6">
        <button
          onClick={toggleTheme}
          className="p-3 rounded-full ios-glass hover:bg-gray-200/20 transition-all text-current"
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>

      {/* activeHabit section logic handled below */}
      <section className="w-full flex flex-col items-center justify-center py-12 min-h-[40vh] relative">
        {activeHabit ? (
          <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-500">

            {/* Timer Ring */}
            <div className="relative flex items-center justify-center drop-shadow-2xl">
              <svg className="transform -rotate-90 w-[300px] h-[300px]">
                <circle
                  cx="150"
                  cy="150"
                  r={circleRadius}
                  stroke="var(--ring)"
                  strokeWidth="8"
                  fill="transparent"
                />
                <circle
                  cx="150"
                  cy="150"
                  r={circleRadius}
                  stroke={activeHabit.color}
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference - (progress / 100) * circumference}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-linear"
                />
              </svg>

              <div className="absolute flex flex-col items-center text-current">
                <span className="text-4xl mb-2 filter drop-shadow-md">{activeHabit.icon}</span>
                <div className="text-7xl font-extralight tracking-tighter tabular-nums drop-shadow-sm">
                  {formatTime(activeHabit.remainingTime)}
                </div>
                <p className="opacity-60 font-medium mt-2">{activeHabit.name}</p>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setActiveHabitId(null)}
                className="ios-btn flex items-center gap-2 px-6 py-3 rounded-full bg-gray-500/10 hover:bg-gray-500/20 text-current border border-gray-500/10 backdrop-blur-md transition-all font-medium"
              >
                <Pause size={18} /> Pause
              </button>
              <button
                onClick={(e) => resetHabit(e, activeHabit.id, activeHabit.target_minutes)}
                className="ios-btn flex items-center gap-2 px-6 py-3 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 backdrop-blur-md transition-all font-medium"
              >
                <RotateCcw size={18} /> Reset
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-24 h-24 rounded-[2rem] bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl mb-4 text-white">
              <Clock size={48} className="opacity-90" />
            </div>
            <h1 className="text-5xl md:text-6xl font-semibold tracking-tight text-current drop-shadow-sm">
              Focus Time
            </h1>
            <p className="text-xl opacity-50 font-light max-w-md text-current">
              Select a habit below to start.
            </p>
          </div>
        )}
      </section>

      {/* Habits Grid */}
      <section className="w-full mt-8">
        <div className="flex items-center justify-between mb-8 px-2">
          <h2 className="text-2xl font-semibold text-current tracking-tight">Your Habits</h2>
          <button
            onClick={() => setIsCreating(true)}
            className="ios-btn px-5 py-2.5 rounded-full bg-[#0A84FF] text-white font-semibold hover:bg-[#0071e3] transition-all flex items-center gap-2 shadow-lg shadow-blue-500/20"
          >
            <Plus size={18} /> New Habit
          </button>
        </div>

        {/* Modal Overlay for Creating Habit */}
        {isCreating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="ios-glass w-full max-w-md rounded-[2rem] p-8 animate-in zoom-in-95 duration-200 shadow-2xl ring-1 ring-white/10 bg-[var(--card-bg)] text-current">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-semibold">New Habit</h3>
                <button onClick={() => setIsCreating(false)} className="p-2 rounded-full hover:bg-gray-500/10 transition-colors">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={createHabit} className="flex flex-col gap-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium opacity-60 ml-1">Name</label>
                  <input autoFocus required value={newHabitName} onChange={e => setNewHabitName(e.target.value)} className="w-full bg-[var(--input-bg)] border-0 rounded-xl px-5 py-3.5 text-current text-lg placeholder:opacity-30 focus:ring-2 focus:ring-[#0A84FF] outline-none transition-all shadow-inner" placeholder="Reading" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium opacity-60 ml-1">Duration (min)</label>
                    <input type="number" required value={newHabitDuration} onChange={e => setNewHabitDuration(Number(e.target.value))} className="w-full bg-[var(--input-bg)] border-0 rounded-xl px-5 py-3.5 text-current text-lg focus:ring-2 focus:ring-[#0A84FF] outline-none transition-all shadow-inner" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium opacity-60 ml-1">Icon</label>
                    <input value={newHabitIcon} onChange={e => setNewHabitIcon(e.target.value)} className="w-full bg-[var(--input-bg)] border-0 rounded-xl px-5 py-3.5 text-current text-lg text-center focus:ring-2 focus:ring-[#0A84FF] outline-none transition-all shadow-inner" placeholder="📚" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium opacity-60 ml-1">Color Theme</label>
                  <div className="flex justify-between gap-2 bg-[var(--input-bg)] p-2 rounded-xl shadow-inner">
                    {['#0A84FF', '#30D158', '#BF5AF2', '#FF9F0A', '#FF375F', '#64D2FF'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewHabitColor(c)}
                        className={clsx(
                          "w-8 h-8 rounded-full transition-all hover:scale-110",
                          newHabitColor === c && "ring-2 ring-current scale-110"
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                <button type="submit" className="mt-4 w-full py-4 rounded-xl bg-[#0A84FF] hover:bg-[#0071e3] text-white font-semibold text-lg transition-all shadow-lg active:scale-[0.98]">
                  Create Habit
                </button>
              </form>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {localHabits.map((habit) => {
            const isActive = activeHabitId === habit.id;
            // Calculate individual progress
            const totalSec = habit.target_minutes * 60;
            const habProgress = totalSec > 0 ? ((totalSec - habit.remainingTime) / totalSec) * 100 : 0;
            const cardBgClass = isActive ? "bg-gray-500/10 ring-1 ring-inset ring-gray-500/20" : "hover:bg-gray-500/10 hover:border-gray-500/20";

            return (
              <div
                key={habit.id}
                onClick={() => toggleHabit(habit.id)}
                className={twMerge(
                  "ios-glass group relative flex flex-col p-5 rounded-[1.5rem] justify-between overflow-hidden cursor-pointer transition-all duration-300 ios-btn h-40",
                  cardBgClass
                )}
              >
                <div className="w-full flex justify-between items-start z-10">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-inner transition-transform group-hover:scale-110 duration-500"
                    style={{ backgroundColor: isActive ? habit.color : 'var(--input-bg)', color: isActive ? '#fff' : habit.color }}
                  >
                    {habit.icon}
                  </div>
                  {isActive && (
                    <div className="bg-gray-500/20 backdrop-blur-md px-2 py-1 rounded-full animate-pulse">
                      <Clock size={14} className="text-current" />
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-start z-10 w-full mt-2">
                  <h3 className="text-lg font-semibold text-current leading-tight mb-0.5">{habit.name}</h3>
                  <div className="flex justify-between w-full items-end">
                    <span className={clsx(
                      "text-xs font-medium transition-colors tabular-nums",
                      isActive ? "text-current" : "text-current opacity-40 group-hover:opacity-60"
                    )}>
                      {formatTime(habit.remainingTime)} left
                    </span>

                    {/* Action buttons mini */}
                    <div className="flex gap-2 relative z-20">
                      <button
                        onClick={(e) => deleteHabit(e, habit.id)}
                        className="p-1.5 rounded-full text-current opacity-20 hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 transition-all"
                        title="Delete Habit"
                      >
                        <Trash2 size={14} />
                      </button>
                      <button
                        onClick={(e) => resetHabit(e, habit.id, habit.target_minutes)}
                        className="p-1.5 rounded-full text-current opacity-20 hover:opacity-100 hover:bg-gray-500/10 transition-all"
                        title="Reset Timer"
                      >
                        <RotateCcw size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Progress bar at bottom */}
                <div className="absolute inset-x-0 bottom-0 h-1.5 bg-gray-500/10">
                  <div
                    className="h-full transition-all duration-1000 ease-linear"
                    style={{ width: `${habProgress}%`, backgroundColor: habit.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
