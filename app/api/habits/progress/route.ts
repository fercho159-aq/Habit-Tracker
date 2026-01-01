import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { habit_id, remaining_seconds } = body;

        // Upsert daily progress
        await query(`
            INSERT INTO daily_progress (habit_id, date, remaining_seconds, updated_at)
            VALUES ($1, CURRENT_DATE, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (habit_id, date)
            DO UPDATE SET remaining_seconds = $2, updated_at = CURRENT_TIMESTAMP
        `, [habit_id, remaining_seconds]);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating progress:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
