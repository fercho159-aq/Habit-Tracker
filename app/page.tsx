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
    throw new Error('Error al cargar datos');
  }
  return res.json();
};

interface Habit {
  id: number;
  name: string;
  icon: string;
  color: string;
  target_minutes: number;
  daily_remaining_seconds?: number;
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
  const workerRef = useRef<Worker | null>(null);

  // Initialize Theme & Web Worker
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      setTheme('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    }

    // Initialize Web Worker
    workerRef.current = new Worker('/timer.worker.js');

    return () => {
      workerRef.current?.terminate();
    };
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

    // Load remaining times from LOCAL STORAGE (backup)
    const savedData = localStorage.getItem('my_habits_timer');
    const savedHabits: Record<number, number> = savedData ? JSON.parse(savedData) : {};

    // Check for active habit end time to sync
    const savedActiveId = localStorage.getItem('active_habit_id');
    const savedEndTime = localStorage.getItem('active_habit_end_time');

    // Temporary map to calculate current status
    const mergedHabits = serverHabits.map(h => {
      // Prioritize Server Daily Progress, fallback to Target Minutes * 60
      let remaining = h.daily_remaining_seconds !== undefined ? h.daily_remaining_seconds : h.target_minutes * 60;

      // NOTE: We trust the server for the "start of session" time if available.
      // But if there's a LOCAL ACTIVE timer, that takes precedence for real-time accuracy.

      // If this was the active habit, re-calculate based on elapsed time from NOW
      if (savedActiveId && Number(savedActiveId) === h.id && savedEndTime) {
        const end = parseInt(savedEndTime, 10);
        const now = Date.now();
        if (end > now) {
          remaining = Math.ceil((end - now) / 1000);
          setActiveHabitId(h.id);
        } else {
          remaining = 0; // Timer finished while away
          setActiveHabitId(null);
          localStorage.removeItem('active_habit_id');
          localStorage.removeItem('active_habit_end_time');
        }
      } else {
        // If not active, but we have local storage data that might differ...
        // Actually, if we want multi-device sync, we should prefer Server Data.
        // But if offline, use Local. 
        // For now, let's assume Server Data (h.daily_remaining_seconds) knows best
        // UNLESS it's undefined (meaning new day or no data), then we might check local?
        // Let's stick to: Server Data > Local Storage if Server Data exists.
      }
      return { ...h, remainingTime: remaining };
    });

    setLocalHabits(mergedHabits);
    setIsLoaded(true);
  }, [serverHabits]);

  // Sync Helper
  const saveProgress = async (habitId: number, seconds: number) => {
    try {
      await fetch('/api/habits/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habit_id: habitId, remaining_seconds: seconds })
      });
    } catch (e) {
      console.error("Failed to save progress", e);
    }
  };

  // 2. Persistence: Save to LocalStorage whenever time changes
  useEffect(() => {
    if (!isLoaded || localHabits.length === 0) return;

    const timeMap = localHabits.reduce((acc, h) => {
      acc[h.id] = h.remainingTime;
      return acc;
    }, {} as Record<number, number>);

    localStorage.setItem('my_habits_timer', JSON.stringify(timeMap));
  }, [localHabits, isLoaded]);

  // 3. Robust Timer Logic with Worker & Timestamp
  useEffect(() => {
    if (!activeHabitId) {
      document.title = "Habit Flow";
      workerRef.current?.postMessage('stop');
      return;
    }

    // Start Worker
    workerRef.current?.postMessage('start');

    // Define tick function
    const handleTick = () => {
      // Get the absolute end time from storage
      const endTimeStr = localStorage.getItem('active_habit_end_time');
      if (!endTimeStr) return; // Should not happen if active

      const endTime = parseInt(endTimeStr, 10);
      const now = Date.now();
      const secondsLeft = Math.ceil((endTime - now) / 1000);

      if (secondsLeft <= 0) {
        // Timer Finished
        setLocalHabits(prev => prev.map(h => h.id === activeHabitId ? { ...h, remainingTime: 0 } : h));
        setActiveHabitId(null);
        localStorage.removeItem('active_habit_id');
        localStorage.removeItem('active_habit_end_time');
        document.title = "¡Tiempo Terminado!";
      } else {
        // Update Tick
        setLocalHabits(prev => prev.map(h => h.id === activeHabitId ? { ...h, remainingTime: secondsLeft } : h));
        // Update Title
        const m = Math.floor(secondsLeft / 60);
        const s = secondsLeft % 60;
        document.title = `${m}:${s.toString().padStart(2, '0')} - Focus`;
      }
    };

    // Listen to worker messages
    const worker = workerRef.current;
    if (worker) {
      worker.onmessage = (e) => {
        if (e.data === 'tick') {
          handleTick();
        }
      };
    }

    return () => {
      if (worker) worker.onmessage = null;
    };
  }, [activeHabitId]);

  const toggleHabit = (id: number) => {
    if (activeHabitId === id) {
      // PAUSE: Just stop, remaining time is already saved in state/localstorage map
      setActiveHabitId(null);
      localStorage.removeItem('active_habit_id');
      localStorage.removeItem('active_habit_end_time');

      // SYNC: Save to DB on Pause
      const currentHabit = localHabits.find(h => h.id === id);
      if (currentHabit) saveProgress(id, currentHabit.remainingTime);
    } else {
      // START / SWITCH

      // SYNC: If switching from another active habit, save THAT one first
      if (activeHabitId) {
        const prevHabit = localHabits.find(h => h.id === activeHabitId);
        if (prevHabit) saveProgress(activeHabitId, prevHabit.remainingTime);
      }

      const habit = localHabits.find(h => h.id === id);
      if (!habit) return;

      const now = Date.now();
      const endTime = now + (habit.remainingTime * 1000);

      localStorage.setItem('active_habit_id', id.toString());
      localStorage.setItem('active_habit_end_time', endTime.toString());
      setActiveHabitId(id);
    }
  };

  const resetHabit = (e: React.MouseEvent, id: number, initialMinutes: number) => {
    e.stopPropagation();
    const newSeconds = initialMinutes * 60;
    setLocalHabits(prev => prev.map(h => h.id === id ? { ...h, remainingTime: newSeconds } : h));

    // SYNC: Save to DB on Reset
    saveProgress(id, newSeconds);

    if (activeHabitId === id) {
      setActiveHabitId(null);
      localStorage.removeItem('active_habit_id');
      localStorage.removeItem('active_habit_end_time');
    }
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

  // Calculate Total Daily Goal
  const totalDailyMinutes = localHabits.reduce((acc, h) => acc + h.target_minutes, 0);
  const totalHours = Math.floor(totalDailyMinutes / 60);
  const totalMins = totalDailyMinutes % 60;

  if (!isLoaded && !serverHabits) return <div className="text-center mt-20 text-gray-500">Cargando hábitos...</div>;

  return (
    <div className="relative min-h-screen w-full overflow-hidden selection:bg-blue-500/30">

      {/* LIGHT MODE AURORA */}
      <div
        className="absolute inset-0 z-0 transition-opacity duration-1000 ease-in-out"
        style={{
          opacity: theme === 'light' ? 1 : 0,
          background: `
                    radial-gradient(ellipse 85% 65% at 8% 8%, rgba(175, 109, 255, 0.42), transparent 60%),
                    radial-gradient(ellipse 75% 60% at 75% 35%, rgba(255, 235, 170, 0.55), transparent 62%),
                    radial-gradient(ellipse 70% 60% at 15% 80%, rgba(255, 100, 180, 0.40), transparent 62%),
                    radial-gradient(ellipse 70% 60% at 92% 92%, rgba(120, 190, 255, 0.45), transparent 62%),
                    linear-gradient(180deg, #f7eaff 0%, #fde2ea 100%)
                `
        }}
      />

      {/* DARK MODE AURORA - "Midnight Whisper" */}
      <div
        className="absolute inset-0 z-0 transition-opacity duration-1000 ease-in-out"
        style={{
          opacity: theme === 'dark' ? 1 : 0,
          background: `
                     radial-gradient(ellipse 80% 60% at 10% 10%, rgba(56, 29, 109, 0.25), transparent 60%),
                     radial-gradient(ellipse 75% 60% at 80% 30%, rgba(15, 118, 110, 0.2), transparent 60%),
                     radial-gradient(ellipse 70% 60% at 20% 80%, rgba(131, 24, 67, 0.2), transparent 60%),
                     radial-gradient(ellipse 70% 60% at 90% 90%, rgba(30, 64, 175, 0.2), transparent 60%),
                     linear-gradient(180deg, #000000 0%, #050510 100%)
                `
        }}
      />

      <main className="relative z-10 min-h-screen p-6 md:p-12 max-w-5xl mx-auto flex flex-col items-center font-sans tracking-tight">

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
                  <Pause size={18} /> Pausar
                </button>
                <button
                  onClick={(e) => resetHabit(e, activeHabit.id, activeHabit.target_minutes)}
                  className="ios-btn flex items-center gap-2 px-6 py-3 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 backdrop-blur-md transition-all font-medium"
                >
                  <RotateCcw size={18} /> Reiniciar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h1 className="text-5xl md:text-6xl font-semibold tracking-tight text-current drop-shadow-sm">
                Tiempo de Enfoque
              </h1>
            </div>
          )}
        </section>

        {/* Habits Grid */}
        <section className="w-full mt-8">
          <div className="flex flex-col md:flex-row items-center justify-between mb-8 px-2 gap-4">
            <div className="flex flex-col items-start">
              <h2 className="text-3xl font-bold text-current tracking-tight">Tus Hábitos</h2>
              <p className="text-current opacity-50 font-medium">
                Meta Diaria Total: {totalHours > 0 ? `${totalHours}h ` : ''}{totalMins}m
              </p>
            </div>

            <button
              onClick={() => setIsCreating(true)}
              className="ios-btn px-6 py-3 rounded-full bg-[#0A84FF] text-white font-semibold hover:bg-[#0071e3] transition-all flex items-center gap-2 shadow-lg shadow-blue-500/20"
            >
              <Plus size={20} /> Nuevo Hábito
            </button>
          </div>

          {/* Modal Overlay for Creating Habit */}
          {isCreating && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="ios-glass w-full max-w-md rounded-[2rem] p-8 animate-in zoom-in-95 duration-200 shadow-2xl ring-1 ring-white/10 bg-[var(--card-bg)] text-current">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-2xl font-semibold">Nuevo Hábito</h3>
                  <button onClick={() => setIsCreating(false)} className="p-2 rounded-full hover:bg-gray-500/10 transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <form onSubmit={createHabit} className="flex flex-col gap-5">
                  <div className="space-y-2">
                    <label className="text-sm font-medium opacity-60 ml-1">Nombre</label>
                    <input autoFocus required value={newHabitName} onChange={e => setNewHabitName(e.target.value)} className="w-full bg-[var(--input-bg)] border-0 rounded-xl px-5 py-3.5 text-current text-lg placeholder:opacity-30 focus:ring-2 focus:ring-[#0A84FF] outline-none transition-all shadow-inner" placeholder="Ej. Lectura" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium opacity-60 ml-1">Duración (min)</label>
                      <input type="number" required value={newHabitDuration} onChange={e => setNewHabitDuration(Number(e.target.value))} className="w-full bg-[var(--input-bg)] border-0 rounded-xl px-5 py-3.5 text-current text-lg focus:ring-2 focus:ring-[#0A84FF] outline-none transition-all shadow-inner" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium opacity-60 ml-1">Icono</label>
                      <input value={newHabitIcon} onChange={e => setNewHabitIcon(e.target.value)} className="w-full bg-[var(--input-bg)] border-0 rounded-xl px-5 py-3.5 text-current text-lg text-center focus:ring-2 focus:ring-[#0A84FF] outline-none transition-all shadow-inner" placeholder="📚" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium opacity-60 ml-1">Color del Tema</label>
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
                    Crear Hábito
                  </button>
                </form>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 w-full max-w-3xl mx-auto">
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
                    "ios-glass group relative flex items-center justify-between p-4 px-6 rounded-[1.5rem] overflow-hidden cursor-pointer transition-all duration-300 ios-btn w-full",
                    cardBgClass
                  )}
                >
                  <div className="flex items-center gap-5 z-10 w-full">
                    {/* Icon */}
                    <div
                      className="w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center text-2xl shadow-inner transition-transform group-hover:scale-110 duration-500"
                      style={{ backgroundColor: isActive ? habit.color : 'var(--input-bg)', color: isActive ? '#fff' : habit.color }}
                    >
                      {habit.icon}
                    </div>

                    {/* Info */}
                    <div className="flex flex-col flex-grow min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-current leading-tight truncate">{habit.name}</h3>
                        {isActive && (
                          <div className="bg-gray-500/20 backdrop-blur-md px-2 py-0.5 rounded-full animate-pulse">
                            <Clock size={12} className="text-current" />
                          </div>
                        )}
                      </div>
                      <span className={clsx(
                        "text-sm font-medium transition-colors tabular-nums mt-0.5",
                        isActive ? "text-current" : "text-current opacity-50 group-hover:opacity-70"
                      )}>
                        {formatTime(habit.remainingTime)} restantes
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 z-20 flex-shrink-0">
                      <button
                        onClick={(e) => resetHabit(e, habit.id, habit.target_minutes)}
                        className="p-2 rounded-full text-current opacity-20 hover:opacity-100 hover:bg-gray-500/10 transition-all"
                        title="Reiniciar Temporizador"
                      >
                        <RotateCcw size={16} />
                      </button>
                      <button
                        onClick={(e) => deleteHabit(e, habit.id)}
                        className="p-2 rounded-full text-current opacity-20 hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 transition-all"
                        title="Eliminar Hábito"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Progress bar background fill */}
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-gray-500/10">
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
    </div>
  );
}
