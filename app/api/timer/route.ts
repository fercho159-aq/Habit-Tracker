import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// GET /api/timer - Get current active timer status
export async function GET() {
    try {
        const result = await query(`
      SELECT t.*, h.name as habit_name, h.icon as habit_icon, h.color as habit_color 
      FROM active_timer t 
      JOIN habits h ON t.habit_id = h.id 
      LIMIT 1
    `);

        if (result.rows.length === 0) {
            return NextResponse.json(null); // No active timer
        }

        const timer = result.rows[0];
        const now = new Date();
        const startedAt = new Date(timer.started_at);
        const elapsedSeconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
        const currentRemaining = Math.max(0, timer.remaining_seconds - elapsedSeconds);

        return NextResponse.json({
            ...timer,
            current_remaining: currentRemaining,
            elapsed: elapsedSeconds,
            is_running: true // For now we assume active_timer means running
        });
    } catch (error) {
        console.error('Error fetching timer:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST /api/timer - Start/Switch timer
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { habit_id } = body; // The ID of the habit to start

        // 1. Check for existing active timer
        const activeRes = await query('SELECT * FROM active_timer LIMIT 1');
        const now = new Date();

        if (activeRes.rows.length > 0) {
            const activeTimer = activeRes.rows[0];

            // Calculate how much time was actually spent
            const startedAt = new Date(activeTimer.started_at);
            const elapsedSeconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000); // Floor to avoid partial seconds issues
            const remaining = activeTimer.remaining_seconds - elapsedSeconds;

            // Save session to history
            await query(
                `INSERT INTO timer_sessions (habit_id, started_at, ended_at, duration_seconds)
         VALUES ($1, $2, $3, $4)`,
                [activeTimer.habit_id, activeTimer.started_at, now, elapsedSeconds]
            );

            // Remove from active_timer
            await query('DELETE FROM active_timer WHERE id = $1', [activeTimer.id]);

            // If we are just stopping (no new habit_id provided), return
            if (!habit_id) {
                return NextResponse.json({ message: 'Timer stopped' });
            }
        }

        if (!habit_id) {
            return NextResponse.json({ message: 'No habit specified' }, { status: 400 });
        }

        // 2. Start new timer
        // First get the habit to know target duration (convert minutes to seconds)
        // OR we should have a 'remaining' state per habit? 
        // The prompt says "automatically start counting down". Usually from a daily goal?
        // Let's assume we start from the habit's target_minutes * 60, OR if we want to resume?
        // For simplicity, let's start fresh or resume if we implemented daily tracking.
        // The prompt implies "permitiendo que cambie de actividad rapidamente y automaticamente empiece a. bajar su contador".
        // This implies a countdown towards 0.

        // Check if we have tracked progress for today?
        // For the MVP, let's just grab the target_minutes from the habit.
        const habitRes = await query('SELECT * FROM habits WHERE id = $1', [habit_id]);
        if (habitRes.rows.length === 0) {
            return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
        }
        const habit = habitRes.rows[0];
        const durationSeconds = habit.target_minutes * 60;

        const newTimer = await query(
            `INSERT INTO active_timer (habit_id, started_at, remaining_seconds, original_duration)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
            [habit_id, now, durationSeconds, durationSeconds]
        );

        return NextResponse.json(newTimer.rows[0]);

    } catch (error) {
        console.error('Error switching timer:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
