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

async function migrate() {
    console.log('Migrating database for daily progress...');
    try {
        // Create daily_progress table
        await query(`
            CREATE TABLE IF NOT EXISTS daily_progress (
                habit_id INTEGER REFERENCES habits(id) ON DELETE CASCADE,
                date DATE DEFAULT CURRENT_DATE,
                remaining_seconds INTEGER NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (habit_id, date)
            )
        `);

        console.log('Migration completed successfully.');
    } catch (err) {
        console.error('Error during migration:', err);
    } finally {
        await pool.end();
    }
}

migrate();
