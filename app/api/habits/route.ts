import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
    try {
        const result = await query('SELECT * FROM habits ORDER BY id ASC');
        return NextResponse.json(result.rows);
    } catch (error) {
        console.error('Error fetching habits:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, icon, color, target_minutes } = body;

        const result = await query(
            `INSERT INTO habits (name, icon, color, target_minutes) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
            [name, icon, color, target_minutes]
        );

        return NextResponse.json(result.rows[0]);
    } catch (error) {
        console.error('Error creating habit:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
