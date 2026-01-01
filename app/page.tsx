'use client';

import { useState, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { Play, Pause, Square, Plus, X, StopCircle, Clock, CheckCircle2 } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Fetcher for SWR
const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error('An error occurred while fetching the data.');
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
    refreshInterval: 1000
  });

  const [localRemaining, setLocalRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (timer?.current_remaining !== undefined) {
      setLocalRemaining(timer.current_remaining);
    } else {
      setLocalRemaining(null);
    }
  }, [timer]);

  useEffect(() => {
    if (localRemaining === null || localRemaining <= 0) return;
    const interval = setInterval(() => {
      setLocalRemaining(prev => (prev && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [localRemaining]);


  const startHabit = async (habitId: number) => {
    await fetch('/api/timer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ habit_id: habitId }),
    });
    mutate('/api/timer');
  };

  const stopTimer = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    await fetch('/api/timer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    mutate('/api/timer');
  };

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
    mutate('/api/habits');
    setNewHabitName('');
  };

  // Progress Ring Calculation
  const progress = timer && timer.original_duration > 0 && localRemaining !== null
    ? ((timer.original_duration - localRemaining) / timer.original_duration) * 100
    : 0;

  const circleRadius = 120;
  const circumference = 2 * Math.PI * circleRadius;
  const items = habits || [];

  return (
    <main className="min-h-screen p-6 md:p-12 max-w-5xl mx-auto flex flex-col items-center font-sans tracking-tight">

      {/* Dynamic Header / Timer Section */}
      <section className="w-full flex flex-col items-center justify-center py-12 min-h-[40vh] relative">
        {timer ? (
          <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-700">

            {/* Timer Ring */}
            <div className="relative flex items-center justify-center drop-shadow-2xl">
              {/* Background Ring */}
              <svg className="transform -rotate-90 w-[300px] h-[300px]">
                <circle
                  cx="150"
                  cy="150"
                  r={circleRadius}
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="8"
                  fill="transparent"
                />
                {/* Progress Ring */}
                <circle
                  cx="150"
                  cy="150"
                  r={circleRadius}
                  stroke={timer.habit_color}
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference - (progress / 100) * circumference}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-linear"
                />
              </svg>

              <div className="absolute flex flex-col items-center">
                <span className="text-4xl mb-2 filter drop-shadow-md">{timer.habit_icon}</span>
                <div className="text-7xl font-extralight tracking-tighter tabular-nums text-white drop-shadow-lg">
                  {localRemaining !== null ? formatTime(localRemaining) : '--:--'}
                </div>
                <p className="text-white/60 font-medium mt-2">{timer.habit_name}</p>
              </div>
            </div>

            <button
              onClick={(e) => stopTimer(e)}
              className="ios-btn mt-4 flex items-center gap-2 px-8 py-3 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 backdrop-blur-md transition-all font-medium"
            >
              <StopCircle size={18} /> End Session
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="w-24 h-24 rounded-[2rem] bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl mb-4">
              <Clock size={48} className="text-white opacity-90" />
            </div>
            <h1 className="text-5xl md:text-6xl font-semibold tracking-tight text-white drop-shadow-xl">
              Focus Time
            </h1>
            <p className="text-xl text-white/50 font-light max-w-md">
              Select a habit below to start your immersive focus session.
            </p>
          </div>
        )}
      </section>

      {/* Habits Grid */}
      <section className="w-full mt-8">
        <div className="flex items-center justify-between mb-8 px-2">
          <h2 className="text-2xl font-semibold text-white tracking-tight">Your Habits</h2>
          <button
            onClick={() => setIsCreating(true)}
            className="ios-btn px-5 py-2.5 rounded-full bg-white text-black font-semibold hover:bg-gray-200 transition-colors flex items-center gap-2 shadow-lg shadow-white/10"
          >
            <Plus size={18} /> New Habit
          </button>
        </div>

        {/* Modal Overlay for Creating Habit */}
        {isCreating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="ios-glass w-full max-w-md rounded-[2rem] p-8 animate-in zoom-in-95 duration-200 shadow-2xl ring-1 ring-white/10 bg-[#1c1c1e]">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-semibold text-white">New Habit</h3>
                <button onClick={() => setIsCreating(false)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={createHabit} className="flex flex-col gap-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/60 ml-1">Name</label>
                  <input autoFocus required value={newHabitName} onChange={e => setNewHabitName(e.target.value)} className="w-full bg-[#2c2c2e] border-0 rounded-xl px-5 py-3.5 text-white text-lg placeholder:text-white/20 focus:ring-2 focus:ring-[#0A84FF] outline-none transition-all" placeholder="Reading" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white/60 ml-1">Duration (min)</label>
                    <input type="number" required value={newHabitDuration} onChange={e => setNewHabitDuration(Number(e.target.value))} className="w-full bg-[#2c2c2e] border-0 rounded-xl px-5 py-3.5 text-white text-lg focus:ring-2 focus:ring-[#0A84FF] outline-none transition-all" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white/60 ml-1">Icon</label>
                    <input value={newHabitIcon} onChange={e => setNewHabitIcon(e.target.value)} className="w-full bg-[#2c2c2e] border-0 rounded-xl px-5 py-3.5 text-white text-lg text-center focus:ring-2 focus:ring-[#0A84FF] outline-none transition-all" placeholder="📚" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/60 ml-1">Color Theme</label>
                  <div className="flex justify-between gap-2 bg-[#2c2c2e] p-2 rounded-xl">
                    {['#0A84FF', '#30D158', '#BF5AF2', '#FF9F0A', '#FF375F', '#64D2FF'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewHabitColor(c)}
                        className={clsx(
                          "w-8 h-8 rounded-full transition-all hover:scale-110",
                          newHabitColor === c && "ring-2 ring-white scale-110"
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
          {items.map((habit) => {
            const isActive = timer?.habit_id === habit.id;
            return (
              <button
                key={habit.id}
                onClick={() => startHabit(habit.id)}
                className={twMerge(
                  "ios-glass group relative flex flex-col p-5 rounded-[1.5rem] items-start transition-all duration-300 ios-btn h-40 justify-between overflow-hidden",
                  isActive
                    ? "bg-white/[0.08] ring-1 ring-inset ring-white/20"
                    : "hover:bg-white/[0.08] hover:border-white/20"
                )}
              >
                {/* Premium Glow effect on hover */}
                <div className="absolute -right-10 -top-10 w-32 h-32 bg-white/5 rounded-full blur-3xl group-hover:bg-white/10 transition-all pointer-events-none" />

                <div className="w-full flex justify-between items-start z-10">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-inner transition-transform group-hover:scale-110 duration-500"
                    style={{ backgroundColor: isActive ? habit.color : '#2c2c2e', color: isActive ? '#fff' : habit.color }}
                  >
                    {habit.icon}
                  </div>
                  {isActive && (
                    <div className="bg-white/20 backdrop-blur-md px-2 py-1 rounded-full">
                      <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-start z-10 w-full">
                  <h3 className="text-lg font-semibold text-white/90 leading-tight mb-1">{habit.name}</h3>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-white/40 group-hover:text-white/60 transition-colors">
                    <Clock size={12} />
                    <span>{habit.target_minutes} min</span>
                  </div>
                </div>

                {/* Active progress bar bottom */}
                {isActive && (
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
                    <div
                      className="h-full transition-all duration-1000 ease-linear"
                      style={{ width: `${progress}%`, backgroundColor: habit.color }}
                    />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
