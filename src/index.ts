import { Hono } from 'hono'

interface Bindings {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

// Test route: Visit localhost:8787/api/ping to verify DB connection
app.get('/api/ping', async (c) => {
  try {
    const result = await c.env.DB.prepare('SELECT 1').first();
    return c.json({ status: 'online', database: 'connected', result });
  } catch (e: any) {
    return c.json({ status: 'error', message: e.message }, 500);
  }
})

export default app