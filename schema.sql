-- 1. Users & Profiles
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    icon_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Projects
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    allowed_tags TEXT -- Stored as comma-separated string
);

-- 3. Project Membership (Who has access?)
CREATE TABLE project_members (
    project_id TEXT,
    user_id TEXT,
    PRIMARY KEY (project_id, user_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4. Logs (The "Blogs")
CREATE TABLE logs (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    author_id TEXT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    excerpt TEXT,
    event_date TEXT, -- The date the user chooses
    is_pinned INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id)
);

-- 5. Attachments (PDFs)
CREATE TABLE attachments (
    id TEXT PRIMARY KEY,
    log_id TEXT,
    file_name TEXT,
    file_size INTEGER,
    file_data TEXT, -- Base64 for now, move to R2 later
    FOREIGN KEY (log_id) REFERENCES logs(id) ON DELETE CASCADE
);

-- 6. Comments
CREATE TABLE comments (
    id TEXT PRIMARY KEY,
    log_id TEXT,
    parent_id TEXT, -- For threading
    author_id TEXT,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (log_id) REFERENCES logs(id) ON DELETE CASCADE
);

-- 7. Edit History (Snapshots)
CREATE TABLE log_history (
    id TEXT PRIMARY KEY,
    log_id TEXT,
    old_title TEXT,
    old_content TEXT,
    old_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (log_id) REFERENCES logs(id) ON DELETE CASCADE
);