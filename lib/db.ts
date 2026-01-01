import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

export async function query(text: string, params?: unknown[]) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

export async function initializeDatabase() {
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
      remaining_seconds INTEGER NOT NULL
    )
  `);
}

export default pool;
