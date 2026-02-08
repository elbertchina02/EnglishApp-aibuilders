const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Required for Azure PostgreSQL
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
  console.error('💥 Unexpected database pool error:', err.message);
});

async function query(text, params) {
  return pool.query(text, params);
}

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'student',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
      );

      CREATE TABLE IF NOT EXISTS lessons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(500) NOT NULL,
        article TEXT NOT NULL,
        dialogue TEXT NOT NULL,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS lesson_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        turn_index INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_lessons_created ON lessons(created_at);
      CREATE INDEX IF NOT EXISTS idx_lesson_messages_lesson ON lesson_messages(lesson_id);
      CREATE INDEX IF NOT EXISTS idx_lesson_messages_user ON lesson_messages(user_id);
    `);
    console.log('✅ Database tables initialized');
  } finally {
    client.release();
  }
}

async function seedDefaultUsers(bcrypt) {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  if (rows[0].count > 0) {
    console.log('👤 Users already exist, skipping seed');
    return;
  }

  const instructorHash = await bcrypt.hash('teach123', 10);
  const studentHash = await bcrypt.hash('learn123', 10);

  await pool.query(
    `INSERT INTO users (username, password_hash, role) VALUES
      ($1, $2, 'instructor'),
      ($3, $4, 'student')`,
    ['instructor', instructorHash, 'student', studentHash]
  );
  console.log('👤 Default users seeded (instructor/teach123, student/learn123)');
}

async function cleanExpiredSessions() {
  const { rowCount } = await pool.query('DELETE FROM sessions WHERE expires_at < NOW()');
  if (rowCount > 0) {
    console.log(`🧹 Cleaned ${rowCount} expired sessions`);
  }
}

module.exports = { query, pool, initDB, seedDefaultUsers, cleanExpiredSessions };
