import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        await query('DELETE FROM habits WHERE id = $1', [id]);

        // Also clean up any active sessions/timers for this habit if needed
        // (Cascade delete handles this automatically in SQL schema)

        return NextResponse.json({ message: 'Habit deleted successfully' });
    } catch (error) {
        console.error('Error deleting habit:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
