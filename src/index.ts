import { Hono } from 'hono';
import { serveStatic } from 'hono/cloudflare-workers';
// @ts-ignore
import manifest from '__STATIC_CONTENT_MANIFEST';

interface Bindings {
  DB: D1Database;
  AVATAR_BUCKET: R2Bucket; 
  ATTACHMENT_BUCKET: R2Bucket;
}

const app = new Hono<{ Bindings: Bindings }>();

// ==========================================
// API ROUTES (Keep all your existing logic)
// ==========================================

app.post('/api/login', async (c) => {
  const { username, password } = await c.req.json();
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE username = ? AND password_hash = ?').bind(username, password).first();
  if (!user) return c.json({ error: 'Invalid credentials' }, 401);
  return c.json({ token: 'real-db-token-' + user.role, user: { username: user.username, role: user.role } });
});

app.get('/api/users', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT username, role FROM users').all();
  return c.json(results || []);
});

// 3. CREATE NEW USER
app.post('/api/users', async (c) => {
  const { username, password } = await c.req.json();
  try {
    await c.env.DB.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').bind(username, password, 'user').run();
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: 'User already exists' }, 400);
  }
});

// 4. DELETE USER
app.delete('/api/users/:username', async (c) => {
  const username = c.req.param('username');
  await c.env.DB.prepare('DELETE FROM users WHERE username = ?').bind(username).run();
  
  // Clean up: delete their avatar from R2 when the user is deleted!
  await c.env.AVATAR_BUCKET.delete(username);
  
  return c.json({ success: true });
});

// 5. UPDATE PROFILE
app.put('/api/profile', async (c) => {
  const { currentUsername, newUsername, currentPass, newPass } = await c.req.json();

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(currentUsername).first();
  if (!user) return c.json({ error: 'User not found' }, 404);

  let finalUsername = currentUsername;
  let finalPassword = user.password_hash;

  if (newPass) {
      if (user.password_hash !== currentPass) return c.json({ error: 'Current password is incorrect!' }, 400);
      finalPassword = newPass;
  }

  if (newUsername && newUsername !== currentUsername) {
      const check = await c.env.DB.prepare('SELECT username FROM users WHERE username = ?').bind(newUsername).first();
      if (check) return c.json({ error: 'Username already taken!' }, 400);
      finalUsername = newUsername;
      
      // If username changes, move their avatar to the new username in R2
      const existingAvatar = await c.env.AVATAR_BUCKET.get(currentUsername);
      if (existingAvatar) {
          const avatarData = await existingAvatar.text();
          await c.env.AVATAR_BUCKET.put(finalUsername, avatarData);
          await c.env.AVATAR_BUCKET.delete(currentUsername);
      }
  }

  await c.env.DB.prepare('UPDATE users SET username = ?, password_hash = ? WHERE username = ?')
      .bind(finalUsername, finalPassword, currentUsername).run();

  await c.env.DB.prepare('UPDATE blogs SET author = ? WHERE author = ?').bind(finalUsername, currentUsername).run();
  await c.env.DB.prepare('UPDATE comments SET author = ? WHERE author = ?').bind(finalUsername, currentUsername).run();

  return c.json({ success: true, username: finalUsername });
});

// 6. SAVE AVATAR TO R2
app.post('/api/avatars', async (c) => {
    const { username, base64Image } = await c.req.json();
    // Save the image directly to the bucket using their username as the file name
    await c.env.AVATAR_BUCKET.put(username, base64Image);
    return c.json({ success: true });
});

// 7. GET AVATAR FROM R2
app.get('/api/avatars/:username', async (c) => {
    const username = c.req.param('username');
    const object = await c.env.AVATAR_BUCKET.get(username);
    
    if (!object) return c.json({ error: 'No custom avatar' }, 404);
    
    const base64Image = await object.text();
    return c.json({ image: base64Image });
});
// ==========================================
// PROJECT ROUTES
// ==========================================

// GET ALL PROJECTS (And their members)
app.get('/api/projects', async (c) => {
  // Fetch projects and members separately
  const { results: projects } = await c.env.DB.prepare('SELECT * FROM projects').all();
  const { results: members } = await c.env.DB.prepare('SELECT * FROM project_members').all();

  // Combine them into the format our frontend expects
  const formattedProjects = projects.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    allowedTags: p.allowed_tags ? (p.allowed_tags as string).split(',') : [],
    members: members.filter(m => m.project_id === p.id).map(m => m.username)
  }));

  return c.json(formattedProjects);
});

// CREATE PROJECT
app.post('/api/projects', async (c) => {
  const { id, name, description, allowedTags, members } = await c.req.json();
  const tagsString = allowedTags.join(',');

  // 1. Save Project
  await c.env.DB.prepare('INSERT INTO projects (id, name, description, allowed_tags) VALUES (?, ?, ?, ?)')
    .bind(id, name, description, tagsString).run();

  // 2. Save Access Members
  for (const member of members) {
    await c.env.DB.prepare('INSERT INTO project_members (project_id, username) VALUES (?, ?)')
      .bind(id, member).run();
  }
  
  return c.json({ success: true });
});

// UPDATE PROJECT
app.put('/api/projects/:id', async (c) => {
  const id = c.req.param('id');
  const { name, description, allowedTags, members } = await c.req.json();
  const tagsString = allowedTags.join(',');

  // 1. Update Project details
  await c.env.DB.prepare('UPDATE projects SET name = ?, description = ?, allowed_tags = ? WHERE id = ?')
    .bind(name, description, tagsString, id).run();

  // 2. Refresh Members (Delete old, insert new)
  await c.env.DB.prepare('DELETE FROM project_members WHERE project_id = ?').bind(id).run();
  for (const member of members) {
    await c.env.DB.prepare('INSERT INTO project_members (project_id, username) VALUES (?, ?)')
      .bind(id, member).run();
  }
  
  return c.json({ success: true });
});

// DELETE PROJECT
// DELETE PROJECT (With R2 Cascade Sweep)
app.delete('/api/projects/:id', async (c) => {
  const id = c.req.param('id');
  
  // 1. Find all blogs in this project
  const { results: blogs } = await c.env.DB.prepare('SELECT id FROM blogs WHERE project_id = ?').bind(id).all();
  
  // 2. Cascade sweeps!
  for (const blog of blogs) {
      // A. Sweep R2 Attachments
      // We look for any file in R2 that starts with this blog's ID
      const listed = await c.env.ATTACHMENT_BUCKET.list({ prefix: `${blog.id}-` });
      const keys = listed.objects.map(o => o.key);
      if (keys.length > 0) {
          await c.env.ATTACHMENT_BUCKET.delete(keys); // Deletes them all at once!
      }

      // B. Sweep Database Comments & Pins
      await c.env.DB.prepare('DELETE FROM comments WHERE blog_id = ?').bind(blog.id).run();
      await c.env.DB.prepare('DELETE FROM pinned_logs WHERE blog_id = ?').bind(blog.id).run();
  }
  
  // 3. Delete the blogs, members, and the project itself
  await c.env.DB.prepare('DELETE FROM blogs WHERE project_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM project_members WHERE project_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
  
  return c.json({ success: true });
});

// ==========================================
// BLOG (LOG) ROUTES
// ==========================================

// GET BLOGS FOR A PROJECT (Now includes who pinned it)
// GET BLOGS FOR A PROJECT (Now includes who pinned it)
app.get('/api/projects/:id/blogs', async (c) => {
  const projectId = c.req.param('id');
  const { results: blogs } = await c.env.DB.prepare('SELECT * FROM blogs WHERE project_id = ? ORDER BY date DESC, created_at DESC').bind(projectId).all();
  const { results: pins } = await c.env.DB.prepare('SELECT * FROM pinned_logs').all();

  const formattedBlogs = blogs.map((b: any) => ({
    id: b.id, projectId: b.project_id, title: b.title, excerpt: b.excerpt, content: b.content,
    tags: b.tags ? b.tags.split(',') : [],
    pinnedBy: pins.filter(p => p.blog_id === b.id).map(p => p.username),
    
    // THIS LINE WAS MISSING! This tells the frontend it's globally pinned!
    pinned: b.pinned === 1, 
    
    author: b.author, date: b.date, createdAt: b.created_at,
    editHistory: b.edit_history ? JSON.parse(b.edit_history) : [],
    attachments: b.attachments ? JSON.parse(b.attachments) : []
  }));

  return c.json(formattedBlogs);
});

// NEW: TOGGLE PIN STATUS FOR A SPECIFIC USER
app.post('/api/projects/:projectId/blogs/:blogId/pin', async (c) => {
    const blogId = c.req.param('blogId');
    const { username, isPinned } = await c.req.json();

    if (isPinned) {
        await c.env.DB.prepare('INSERT OR IGNORE INTO pinned_logs (username, blog_id) VALUES (?, ?)').bind(username, blogId).run();
    } else {
        await c.env.DB.prepare('DELETE FROM pinned_logs WHERE username = ? AND blog_id = ?').bind(username, blogId).run();
    }
    return c.json({ success: true });
});

// CREATE A NEW BLOG
// CREATE A NEW BLOG
app.post('/api/projects/:id/blogs', async (c) => {
  const projectId = c.req.param('id');
  const { id, title, excerpt, content, tags, pinned, author, date, createdAt, attachments } = await c.req.json();
  const tagsString = tags.join(',');
  
  const attachmentsStr = JSON.stringify(attachments || []);
  const historyStr = JSON.stringify([]);

  // Note: We always insert 0 for the old global 'pinned' column now.
  await c.env.DB.prepare('INSERT INTO blogs (id, project_id, title, excerpt, content, tags, pinned, author, date, created_at, attachments, edit_history) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)')
    .bind(id, projectId, title, excerpt, content, tagsString, author, date, createdAt, attachmentsStr, historyStr).run();

  // THE ONE-TIME BLAST PIN
  if (pinned) {
      const { results: members } = await c.env.DB.prepare('SELECT username FROM project_members WHERE project_id = ?').bind(projectId).all();
      const { results: admins } = await c.env.DB.prepare('SELECT username FROM users WHERE role = "admin"').all();
      
      // Combine members, admins, and the author into one unique list
      const usersToPin = new Set([...members.map((m: any) => m.username), ...admins.map((a: any) => a.username), author]);
      
      for (const user of usersToPin) {
          await c.env.DB.prepare('INSERT OR IGNORE INTO pinned_logs (username, blog_id) VALUES (?, ?)').bind(user, id).run();
      }
  }

  return c.json({ success: true });
});

// UPDATE AN EXISTING BLOG
app.put('/api/projects/:projectId/blogs/:blogId', async (c) => {
  const blogId = c.req.param('blogId');
  const projectId = c.req.param('projectId');
  const { title, excerpt, content, tags, pinned, date, editHistory, attachments } = await c.req.json();
  const tagsString = tags.join(',');
  
  const historyStr = JSON.stringify(editHistory || []);
  const attachmentsStr = JSON.stringify(attachments || []);

  await c.env.DB.prepare('UPDATE blogs SET title = ?, excerpt = ?, content = ?, tags = ?, date = ?, edit_history = ?, attachments = ? WHERE id = ?')
    .bind(title, excerpt, content, tagsString, date, historyStr, attachmentsStr, blogId).run();

  // THE ONE-TIME BLAST PIN (If they check it again during an edit!)
  if (pinned) {
      const { results: members } = await c.env.DB.prepare('SELECT username FROM project_members WHERE project_id = ?').bind(projectId).all();
      const { results: admins } = await c.env.DB.prepare('SELECT username FROM users WHERE role = "admin"').all();
      const usersToPin = new Set([...members.map((m: any) => m.username), ...admins.map((a: any) => a.username)]);
      
      for (const user of usersToPin) {
          await c.env.DB.prepare('INSERT OR IGNORE INTO pinned_logs (username, blog_id) VALUES (?, ?)').bind(user, blogId).run();
      }
  }

  return c.json({ success: true });
});

// ==========================================
// COMMENT ROUTES
// ==========================================

// GET ALL COMMENTS FOR A PROJECT (Using a SQL JOIN to match comments to the project's blogs)
app.get('/api/projects/:projectId/comments', async (c) => {
    const projectId = c.req.param('projectId');
    const { results } = await c.env.DB.prepare(`
        SELECT c.* FROM comments c
        JOIN blogs b ON c.blog_id = b.id
        WHERE b.project_id = ?
        ORDER BY c.created_at ASC
    `).bind(projectId).all();

    const formattedComments = results.map((row: any) => ({
        id: row.id,
        blogId: row.blog_id,
        parentId: row.parent_id,
        author: row.author,
        content: row.content,
        date: row.created_at,
        depth: row.depth
    }));

    return c.json(formattedComments);
});

// CREATE A NEW COMMENT
app.post('/api/projects/:projectId/blogs/:blogId/comments', async (c) => {
    const blogId = c.req.param('blogId');
    const { id, parentId, author, content, date, depth } = await c.req.json();

    await c.env.DB.prepare('INSERT INTO comments (id, blog_id, parent_id, author, content, created_at, depth) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(id, blogId, parentId || null, author, content, date, depth).run();

    return c.json({ success: true });
});

// ==========================================
// ATTACHMENT ROUTES
// ==========================================

// UPLOAD AN ATTACHMENT (True Binary)
app.post('/api/attachments', async (c) => {
    const { blogId, name, type, base64Data } = await c.req.json();
    
    // Clean the filename so special characters don't break the URL
    const cleanName = name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `${blogId}-${Date.now()}-${cleanName}`;
    
    // Extract just the raw base64 string (removes "data:image/png;base64,")
    const base64String = base64Data.split(',')[1];
    
    // Convert to a true binary buffer
    const binaryString = atob(base64String);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Store the binary file in R2
    await c.env.ATTACHMENT_BUCKET.put(key, bytes.buffer, { httpMetadata: { contentType: type } });
    return c.json({ key, name, type });
});

// DOWNLOAD AN ATTACHMENT (Raw Stream)
app.get('/api/attachments/:key', async (c) => {
    const key = c.req.param('key');
    const object = await c.env.ATTACHMENT_BUCKET.get(key);
    
    if (!object) return c.json({ error: 'File not found' }, 404);
    
    // Tell the browser what kind of file this is
    c.header('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
    
    // Force the browser to trigger a download window
    c.header('Content-Disposition', `attachment; filename="${key.split('-').slice(2).join('-')}"`);
    
    return c.body(object.body); // Stream the raw file directly!
});

// DELETE AN ATTACHMENT (When manually removed from a log)
app.delete('/api/attachments/:key', async (c) => {
    const key = c.req.param('key');
    await c.env.ATTACHMENT_BUCKET.delete(key);
    return c.json({ success: true });
});

app.get('/*', serveStatic({ 
  manifest,
  rewriteRequestPath: (path) => path === '/' ? '/index.html' : path 
}));

export default app;