CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password_hash TEXT, role TEXT);

CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT, description TEXT, allowed_tags TEXT);

CREATE TABLE IF NOT EXISTS project_members (project_id TEXT, username TEXT, PRIMARY KEY (project_id, username));

CREATE TABLE IF NOT EXISTS blogs (id TEXT PRIMARY KEY, project_id TEXT, title TEXT NOT NULL, excerpt TEXT, content TEXT, tags TEXT, pinned INTEGER DEFAULT 0, author TEXT, date TEXT, created_at TEXT, attachments TEXT DEFAULT '[]', edit_history TEXT DEFAULT '[]');

CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, blog_id TEXT, parent_id TEXT, author TEXT, content TEXT, created_at TEXT, depth INTEGER);

CREATE TABLE IF NOT EXISTS pinned_logs (username TEXT, blog_id TEXT, PRIMARY KEY (username, blog_id));