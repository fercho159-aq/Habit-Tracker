import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { habit_id, remaining_seconds } = body;

        console.log('[PROGRESS API] Saving:', { habit_id, remaining_seconds });

        // Upsert daily progress
        const result = await query(`
            INSERT INTO daily_progress (habit_id, date, remaining_seconds, updated_at)
            VALUES ($1, CURRENT_DATE, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (habit_id, date)
            DO UPDATE SET remaining_seconds = EXCLUDED.remaining_seconds, updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `, [habit_id, remaining_seconds]);

        console.log('[PROGRESS API] Result:', result.rows);

        return NextResponse.json({ success: true, data: result.rows[0] });
    } catch (error: any) {
        console.error('[PROGRESS API] Error:', error.message, error.stack);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
