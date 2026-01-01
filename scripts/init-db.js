const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Read .env.local manually
const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const dbUrlMatch = envContent.match(/DATABASE_URL="([^"]+)"/);
const connectionString = dbUrlMatch ? dbUrlMatch[1] : process.env.DATABASE_URL;

const pool = new Pool({
    connectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

async function query(text, params) {
    const client = await pool.connect();
    try {
        return await client.query(text, params);
    } finally {
        client.release();
    }
}

async function initializeDatabase() {
    console.log('Initializing database...');
    try {
        await query(`
      CREATE TABLE IF NOT EXISTS habits (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        icon VARCHAR(50) DEFAULT '⭐',
        color VARCHAR(20) DEFAULT '#6366f1',
        target_minutes INTEGER DEFAULT 30,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

        await query(`
      CREATE TABLE IF NOT EXISTS timer_sessions (
        id SERIAL PRIMARY KEY,
        habit_id INTEGER REFERENCES habits(id) ON DELETE CASCADE,
        started_at TIMESTAMP NOT NULL,
        ended_at TIMESTAMP,
        duration_seconds INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

        await query(`
      CREATE TABLE IF NOT EXISTS active_timer (
        id SERIAL PRIMARY KEY,
        habit_id INTEGER REFERENCES habits(id) ON DELETE CASCADE,
        started_at TIMESTAMP NOT NULL,
        remaining_seconds INTEGER NOT NULL,
        original_duration INTEGER NOT NULL
      )
    `); // Added original_duration to track total time if needed

        // Check if habits are empty, if so, seed some defaults
        const habitsRes = await query('SELECT count(*) FROM habits');
        if (parseInt(habitsRes.rows[0].count) === 0) {
            console.log('Seeding default habits...');
            await query(`
        INSERT INTO habits (name, icon, color, target_minutes) VALUES
        ('Read Book', '📖', '#3b82f6', 30),
        ('Exercise', '💪', '#10b981', 45),
        ('Deep Work', '💻', '#8b5cf6', 60),
        ('Meditation', '🧘', '#f59e0b', 15)
      `);
        }

        console.log('Database initialized successfully.');
    } catch (err) {
        console.error('Error initializing database:', err);
    } finally {
        await pool.end();
    }
}

initializeDatabase();
