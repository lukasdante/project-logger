import { Hono } from 'hono';
import { jwt } from 'hono/jwt';
import { v4 as uuidv4 } from 'uuid';

const app = new Hono<{ Bindings: { DB: D1Database } }>();

// Secret for JWT (Change this in production!)
const JWT_SECRET = 'your-secret-key';

// --- AUTHENTICATION ---
app.post('/api/login', async (c) => {
  const { username, password } = await c.req.json();
  
  // Real SQL check
  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE username = ? AND password_hash = ?'
  ).bind(username, password).first();

  if (!user) return c.json({ error: 'Invalid credentials' }, 401);

  const payload = { username: user.username, role: user.role, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 };
  const token = await sign(payload, JWT_SECRET);

  return c.json({ token, user: { username: user.username, role: user.role, icon: user.icon_url } });
});

// --- LOGS API ---
// Fetch all logs for a project
app.get('/api/projects/:id/logs', async (c) => {
  const projectId = c.req.param('id');
  const { results } = await c.env.DB.prepare(`
    SELECT logs.*, users.username as author 
    FROM logs 
    JOIN users ON logs.author_id = users.id 
    WHERE project_id = ? 
    ORDER BY is_pinned DESC, created_at DESC
  `).bind(projectId).all();
  
  return c.json(results);
});

// Save a new log
app.post('/api/projects/:id/logs', async (c) => {
  const projectId = c.req.param('id');
  const { title, content, event_date, is_pinned, attachments } = await c.req.json();
  const logId = uuidv4();

  // 1. Insert Log
  await c.env.DB.prepare(
    'INSERT INTO logs (id, project_id, title, content, event_date, is_pinned) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(logId, projectId, title, content, event_date, is_pinned ? 1 : 0).run();

  // 2. Insert Attachments
  for (const file of attachments) {
    await c.env.DB.prepare(
      'INSERT INTO attachments (id, log_id, file_name, file_size, file_data) VALUES (?, ?, ?, ?, ?)'
    ).bind(uuidv4(), logId, file.name, file.size, file.data).run();
  }

  return c.json({ success: true, logId });
});

export default app;