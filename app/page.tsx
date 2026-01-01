'use client';

import { useState, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { Play, Pause, Square, Plus, Trash2, StopCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Fetcher for SWR
const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error('An error occurred while fetching the data.');
    try {
      const info = await res.json();
      // @ts-ignore
      error.info = info;
    } catch (e) {
      // @ts-ignore
      error.info = { message: 'Failed to parse error response' };
    }
    // @ts-ignore
    error.status = res.status;
    throw error;
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

interface TimerStatus {
  id: number;
  habit_id: number;
  started_at: string;
  remaining_seconds: number;
  original_duration: number;
  habit_name: string;
  habit_icon: string;
  habit_color: string;
  current_remaining: number;
  is_running: boolean;
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
  const { data: habits, error: habitsError } = useSWR<Habit[]>('/api/habits', fetcher);
  const { data: timer, error: timerError } = useSWR<TimerStatus | null>('/api/timer', fetcher, {
    refreshInterval: 1000 // Poll every second to sync
  });

  const [localRemaining, setLocalRemaining] = useState<number | null>(null);

  // Sync local timer for smooth countdown
  useEffect(() => {
    if (timer?.current_remaining !== undefined) {
      setLocalRemaining(timer.current_remaining);
    } else {
      setLocalRemaining(null);
    }
  }, [timer]);

  // Local decrementor (independent of polling for smoothness)
  useEffect(() => {
    if (localRemaining === null || localRemaining <= 0) return;
    const interval = setInterval(() => {
      setLocalRemaining(prev => (prev && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [localRemaining]);


  const startHabit = async (habitId: number) => {
    // Optimistic UI update logic could go here, but for now we rely on SWR revalidation
    await fetch('/api/timer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ habit_id: habitId }),
    });
    mutate('/api/timer');
  };

  const stopTimer = async () => {
    await fetch('/api/timer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // habit_id undefined means stop
      body: JSON.stringify({}),
    });
    mutate('/api/timer');
  };

  const [isCreating, setIsCreating] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const [newHabitIcon, setNewHabitIcon] = useState('✨');
  const [newHabitColor, setNewHabitColor] = useState('#6366f1');
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
    mutate('/api/habits');
    setNewHabitName('');
  };

  if (habitsError) return <div className="p-10 text-red-400">Error loading habits</div>;
  if (!habits) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading...</div>;

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto flex flex-col gap-12">

      {/* Header & Active Timer Display */}
      <section className="flex flex-col items-center justify-center gap-6 py-10 relative">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-blue-500/10 to-transparent blur-3xl -z-10 pointer-events-none" />

        {timer ? (
          <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-500">
            <div className="text-6xl md:text-8xl font-black tabular-nums tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 drop-shadow-2xl">
              {localRemaining !== null ? formatTime(localRemaining) : '--:--'}
            </div>
            <div className="flex items-center gap-3 text-xl md:text-2xl font-medium px-6 py-2 rounded-full glass-panel text-slate-200">
              <span style={{ color: timer.habit_color }}>{timer.habit_icon}</span>
              <span>{timer.habit_name}</span>
            </div>
            <button
              onClick={stopTimer}
              className="mt-4 flex items-center gap-2 px-6 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all font-semibold"
            >
              <StopCircle size={20} /> Stop Focus
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center py-10 opacity-60">
            <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-200 to-slate-500">
              Ready to Focus?
            </h1>
            <p className="text-lg text-slate-400">Select a habit below to start your timer.</p>
          </div>
        )}
      </section>

      {/* Habits Grid */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-200 flex items-center gap-2">
            Your Habits <span className="text-sm font-normal text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded-full">{habits.length}</span>
          </h2>
          <button
            onClick={() => setIsCreating(!isCreating)}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2"
          >
            <Plus size={18} /> New Habit
          </button>
        </div>

        {/* Create Habit Form */}
        {isCreating && (
          <form onSubmit={createHabit} className="mb-8 glass-panel p-6 rounded-2xl animate-in slide-in-from-top-4 fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Name</label>
                <input required value={newHabitName} onChange={e => setNewHabitName(e.target.value)} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Read" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Duration (min)</label>
                  <input type="number" required value={newHabitDuration} onChange={e => setNewHabitDuration(Number(e.target.value))} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Icon</label>
                  <input value={newHabitIcon} onChange={e => setNewHabitIcon(e.target.value)} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Emoji" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setIsCreating(false)} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">Cancel</button>
              <button type="submit" className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-all">Save Habit</button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {habits.map((habit) => {
            const isActive = timer?.habit_id === habit.id;
            return (
              <button
                key={habit.id}
                onClick={() => startHabit(habit.id)}
                className={twMerge(
                  "group relative p-6 rounded-2xl text-left transition-all duration-300 border hover:scale-[1.02] active:scale-[0.98]",
                  isActive
                    ? "bg-slate-800/80 border-blue-500/50 ring-2 ring-blue-500/20 shadow-xl shadow-blue-500/10"
                    : "glass-panel border-slate-800 hover:border-slate-600 hover:bg-slate-800/40"
                )}
              >
                {isActive && (
                  <div className="absolute top-4 right-4">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                    </span>
                  </div>
                )}

                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4 transition-transform group-hover:scale-110 duration-300"
                  style={{ backgroundColor: `${habit.color}20`, color: habit.color }}
                >
                  {habit.icon}
                </div>

                <h3 className="text-xl font-bold text-slate-200 mb-1">{habit.name}</h3>
                <p className="text-sm text-slate-500 group-hover:text-slate-400 transition-colors">
                  {habit.target_minutes} minutes goal
                </p>

                <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
