const appRoot = document.getElementById('app-root');
const topNav = document.querySelector('.top-nav');

// --- Auth State ---
let authToken = localStorage.getItem('logTrackerToken');
let currentUserRole = localStorage.getItem('logTrackerRole'); 

// --- Mock Data (Now acts as our temporary in-memory database) ---
// NEW: Pool of available users to add to projects
// --- Mock Data & Global State ---
const PREDEFINED_ICONS = [
    'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=admin',
    'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=user',
    'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=dan',
    'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=diane',
    'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=eva',
    'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=frank'
];

const MOCK_USERS = ['admin', 'user', 'developer_dan', 'designer_diane'];

let MOCK_USER_PROFILES = {
    'admin': PREDEFINED_ICONS[0],
    'user': PREDEFINED_ICONS[1],
    'developer_dan': PREDEFINED_ICONS[2],
    'designer_diane': PREDEFINED_ICONS[3]
};

let currentUsername = localStorage.getItem('logTrackerUsername') || 'Guest';
let currentUserIcon = localStorage.getItem('logTrackerIcon') || MOCK_USER_PROFILES[currentUsername] || PREDEFINED_ICONS[0];

const getUserIcon = (username) => MOCK_USER_PROFILES[username] || PREDEFINED_ICONS[0];
let savedIcon = localStorage.getItem('logTrackerIcon');
if (savedIcon) {
    MOCK_USER_PROFILES[currentUsername] = savedIcon;
}

// UPDATED: Added a 'members' array to each project
let MOCK_PROJECTS = [
    { id: '1', name: 'Alpha Release', description: 'Tracking bugs for v1.0', allowedTags: ['bug', 'feature', 'ui'], members: ['admin', 'user'] },
    { id: '2', name: 'Design System', description: 'UI component updates', allowedTags: ['css', 'ux', 'assets'], members: ['admin', 'designer_diane'] }
];

let MOCK_BLOGS = [
    { id: 'b1', projectId: '1', title: 'Server Outage Log', excerpt: 'Post-mortem on yesterday\'s downtime.', content: 'Post-mortem on yesterday\'s downtime. The database hit max connections...', tags: ['bug'], pinned: true, author: 'admin', date: '2026-04-02' },
    { id: 'b2', projectId: '1', title: 'Update on feature X', excerpt: 'Screenshots attached below.', content: 'Screenshots attached below showing the new padding fixes.', tags: ['ui'], pinned: false, author: 'user', date: '2026-04-03' }
];

let MOCK_COMMENTS = [
    { id: 'c1', blogId: 'b1', parentId: null, author: 'user', content: 'Did we check the load balancer?', date: '2 hours ago', depth: 1 },
    { id: 'c2', blogId: 'b1', parentId: 'c1', author: 'admin', content: 'Yes, it was a DNS issue.', date: '1 hour ago', depth: 2 },
    { id: 'c3', blogId: 'b1', parentId: 'c2', author: 'user', content: 'Ah, it is always DNS. Thanks!', date: '45 mins ago', depth: 3 }
];



// --- Helper Functions for Data ---
const getCommentCount = (blogId) => MOCK_COMMENTS.filter(c => c.blogId === blogId).length;
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

// --- Gallery UI State Handlers ---
// --- Gallery UI State Handlers ---
window.currentGalleryProjectId = null;
window.galleryState = { filters: [], sortOrder: 'desc', searchQuery: '' };

window.updateGalleryView = function() {
    const masonry = document.querySelector('.blog-masonry');
    if (masonry) masonry.innerHTML = getBlogCardsHtml(window.currentGalleryProjectId);
};

window.toggleGalleryFilter = function(tag) {
    if (window.galleryState.filters.includes(tag)) {
        window.galleryState.filters = window.galleryState.filters.filter(t => t !== tag);
    } else {
        window.galleryState.filters.push(tag);
    }
    window.updateGalleryView(); // Only updates the cards!
};

window.changeSortOrder = function(order) {
    window.galleryState.sortOrder = order;
    window.updateGalleryView(); // Only updates the cards!
};

window.handleSearch = function(query) {
    window.galleryState.searchQuery = query.toLowerCase();
    window.updateGalleryView(); // Live search updates the cards instantly!
};

window.togglePin = function(e, blogId) {
    e.stopPropagation();
    const blog = MOCK_BLOGS.find(b => b.id === blogId);
    if (blog) {
        blog.pinned = !blog.pinned;
        window.updateGalleryView(); // Only updates the cards!
    }
};

function handleUpdateProfile(e) {
    e.preventDefault();
    const newUsername = document.getElementById('profile-username').value.trim();
    const currentPass = document.getElementById('profile-current-password').value;
    const newPass = document.getElementById('profile-password').value;
    const confirmPass = document.getElementById('profile-confirm-password').value;
    const msgDiv = document.getElementById('profile-message');

    // Password Validation
    if (newPass || confirmPass) {
        const expectedOldPass = currentUsername === 'admin' ? 'admin123' : 'user123';
        if (currentPass !== expectedOldPass) {
            msgDiv.style.color = '#ef4444'; 
            msgDiv.innerHTML = '<i class="ph ph-warning-circle"></i> Current password is incorrect!';
            return;
        }
        if (newPass !== confirmPass) {
            msgDiv.style.color = '#ef4444'; 
            msgDiv.innerHTML = '<i class="ph ph-warning-circle"></i> New passwords do not match!';
            return;
        }
    }

    // Update Username & Icon State
// Update Username & Icon State
    if (newUsername !== currentUsername) {
        
        // FIX: Propagate the new username to all past logs and comments!
        MOCK_BLOGS.forEach(blog => { 
            if (blog.author === currentUsername) blog.author = newUsername; 
        });
        MOCK_COMMENTS.forEach(comment => { 
            if (comment.author === currentUsername) comment.author = newUsername; 
        });

        // Update user pools
        const userIndex = MOCK_USERS.indexOf(currentUsername);
        if (userIndex !== -1) MOCK_USERS[userIndex] = newUsername;
        
        MOCK_USER_PROFILES[newUsername] = window.tempSelectedIcon;
        delete MOCK_USER_PROFILES[currentUsername];
        
        currentUsername = newUsername;
        localStorage.setItem('logTrackerUsername', newUsername);
    } else {
        // Just updating the icon
        MOCK_USER_PROFILES[currentUsername] = window.tempSelectedIcon;
    }

    currentUserIcon = window.tempSelectedIcon;
    localStorage.setItem('logTrackerIcon', currentUserIcon);

    msgDiv.style.color = '#10b981'; 
    msgDiv.innerHTML = '<i class="ph ph-check-circle"></i> Profile updated successfully!';
    
    document.getElementById('profile-current-password').value = '';
    document.getElementById('profile-password').value = '';
    document.getElementById('profile-confirm-password').value = '';
    
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.innerHTML = `<i class="ph ph-sign-out"></i> Logout (${currentUsername})`;

    setTimeout(() => { if(msgDiv) msgDiv.textContent = ''; }, 3000);
}

// --- Form Submission Handlers ---

function handleEditProject(e, projectId) {
    e.preventDefault(); // Prevents the page from reloading
    
    const name = document.getElementById('edit-proj-name').value;
    const desc = document.getElementById('edit-proj-desc').value;
    const tagsInput = document.getElementById('edit-proj-tags').value;

    // Grab all checked member checkboxes
    const memberCheckboxes = document.querySelectorAll('.edit-proj-member:checked');
    const membersArray = Array.from(memberCheckboxes).map(cb => cb.value);

    // Process tags
    const tagsArray = tagsInput.split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);

    // Update the mock database
    const projectIndex = MOCK_PROJECTS.findIndex(p => p.id === projectId);
    if (projectIndex !== -1) {
        MOCK_PROJECTS[projectIndex].name = name;
        MOCK_PROJECTS[projectIndex].description = desc;
        MOCK_PROJECTS[projectIndex].allowedTags = tagsArray;
        MOCK_PROJECTS[projectIndex].members = membersArray;
    }

    // Force redirect back to the log gallery
    window.location.hash = `#/project/${projectId}`;
}

function handleCreateProject(e) {
    e.preventDefault();
    const name = document.getElementById('proj-name').value;
    const desc = document.getElementById('proj-desc').value;
    const tagsInput = document.getElementById('proj-tags').value;

    // Process tags: split by comma, clean whitespace, remove empty entries
    const tagsArray = tagsInput.split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);

    // Process members: grab all checked boxes
    const memberCheckboxes = document.querySelectorAll('.create-proj-member:checked');
    const membersArray = Array.from(memberCheckboxes).map(cb => cb.value);
    
    MOCK_PROJECTS.push({
        id: generateId(),
        name: name,
        description: desc,
        allowedTags: tagsArray,
        members: membersArray
    });
    
    window.location.hash = '#/'; // Go back to gallery
}

// UPDATED: Handles both creating a new log and saving edits to an existing one
function handleSaveLog(e, projectId, blogId) {
    e.preventDefault();
    const title = document.getElementById('log-title').value;
    const content = document.getElementById('log-content').innerHTML;
    const dateValue = document.getElementById('log-date').value;
    const isPinned = document.getElementById('log-pinned').checked;
    const now = new Date().toISOString();
    
    const checkedBoxes = document.querySelectorAll('.tag-checkbox:checked');
    const tags = Array.from(checkedBoxes).map(cb => cb.value);

    // Create clean excerpt
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    const rawText = tempDiv.textContent || tempDiv.innerText || "";
    const excerpt = rawText.substring(0, 70) + (rawText.length > 70 ? '...' : '');

    if (blogId === 'new') {
        // --- CREATE NEW LOG ---
        MOCK_BLOGS.unshift({ 
            id: generateId(),
            projectId: projectId,
            title: title,
            excerpt: excerpt,
            content: content,
            tags: tags,
            pinned: isPinned,
            author: currentUsername,
            date: dateValue,
            createdAt: now,
            editHistory: [],
            // CRITICAL: Save the files from the temporary tray
            attachments: [...window.tempUploadedFiles] 
        });
    } else {
        // --- UPDATE EXISTING LOG ---
        const blogIndex = MOCK_BLOGS.findIndex(b => b.id === blogId);
        if (blogIndex !== -1) {
            const oldBlog = MOCK_BLOGS[blogIndex];

            // Save snapshot to history
            if (!oldBlog.editHistory) oldBlog.editHistory = [];
            oldBlog.editHistory.unshift({
                timestamp: now,
                oldTitle: oldBlog.title,
                oldContent: oldBlog.content,
                oldDate: oldBlog.date,
                oldTags: [...oldBlog.tags]
            });

            // Update with new data
            oldBlog.title = title;
            oldBlog.excerpt = excerpt;
            oldBlog.content = content;
            oldBlog.tags = tags;
            oldBlog.pinned = isPinned;
            oldBlog.date = dateValue;
            // CRITICAL: Update the attachments
            oldBlog.attachments = [...window.tempUploadedFiles];
        }
    }

    // --- RESET THE TRAY ---
    window.tempUploadedFiles = [];

    const targetBlogId = blogId === 'new' ? MOCK_BLOGS[0].id : blogId;
    window.location.hash = `#/project/${projectId}/blog/${targetBlogId}`;
}


// NEW: Toggles the visibility of the reply form under a specific comment
window.toggleReplyForm = function(commentId) {
    const form = document.getElementById('reply-form-' + commentId);
    form.style.display = form.style.display === 'none' ? 'flex' : 'none';
};

// UPDATED: Now handles both main comments and nested replies
function handleAddComment(e, blogId, parentId = null, depth = 1) {
    e.preventDefault();
    const inputId = parentId ? `reply-input-${parentId}` : 'new-comment-text';
    const input = document.getElementById(inputId);
    if (!input.value.trim()) return;

    MOCK_COMMENTS.push({
        id: generateId(),
        blogId: blogId,
        parentId: parentId,
        author: currentUsername,
        content: input.value,
        date: 'Just now',
        depth: Math.min(depth, 3) // FEATURE: Clamps max depth to 3
    });

    router(); 
}

// --- Views ---

function LoginView() {
    return `
        <div style="min-height: 80vh; display: flex; align-items: center; justify-content: center;">
            <div class="card" style="width: 100%; max-width: 400px;">
                <h2 style="text-align: center; margin-bottom: 0.5rem;"><i class="ph ph-lock-key"></i> Login</h2>
                <form id="login-form">
                    <div class="form-group"><label>Username</label><input type="text" id="username" class="form-input" required></div>
                    <div class="form-group"><label>Password</label><input type="password" id="password" class="form-input" required></div>
                    <button type="submit" class="btn">Log In</button>
                </form>
            </div>
        </div>
    `;
}

function ProjectCreateView() {
    // Generate checkboxes for all users. Automatically check the person creating the project!
    const membersHtml = MOCK_USERS.map(u => `
        <label style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem; cursor: pointer;">
            <input type="checkbox" class="create-proj-member" value="${u}" ${u === currentUsername ? 'checked' : ''}>
            <i class="ph ph-user"></i> ${u}
        </label>
    `).join('');

    return `
        <div class="card" style="max-width: 600px; margin: 0 auto;">
            <button class="btn" style="background: transparent; color: var(--text-muted); width: auto; padding: 0; margin-bottom: 1rem;" onclick="window.location.hash='#/'">
                <i class="ph ph-arrow-left"></i> Back to Projects
            </button>
            <h2><i class="ph ph-folder-plus"></i> Create New Project</h2>
            
            <form id="create-project-form" style="margin-top: 1.5rem;">
                <div class="form-group">
                    <label>Project Name</label>
                    <input type="text" id="proj-name" class="form-input" required>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea id="proj-desc" class="form-input" rows="3" required></textarea>
                </div>
                <div class="form-group">
                    <label>Allowed Tags (comma separated)</label>
                    <input type="text" id="proj-tags" class="form-input" placeholder="e.g. bug, feature, urgent">
                </div>
                <div class="form-group">
                    <label>Manage Access</label>
                    <div class="scrollable-checklist" style="background: #ffffff;">
                        ${membersHtml}
                    </div>
                </div>
                <button type="submit" class="btn" style="margin-top: 1rem;">Create Project</button>
            </form>
        </div>
    `;
}

// NEW: Recursively builds the comment tree HTML
// UPDATED: Builds the tree chronologically but keeps DOM elements flat to prevent infinite indents
function renderCommentTree(comments, blogId, parentId = null, currentDepth = 1) {
    const children = comments.filter(c => c.parentId === parentId);
    if (children.length === 0) return '';

    return children.map(c => {
        // Clamp the visual depth to a maximum of 3 (or whatever you prefer)
        const visualDepth = Math.min(currentDepth, 3);
        
        return `
            <div class="comment ${visualDepth > 1 ? 'comment-depth-' + visualDepth : ''}">
                <div class="comment-meta">
                    <div class="comment-avatar"><i class="ph ph-user"></i></div>
                    <strong>${c.author}</strong> • ${c.date}
                </div>
                <p>${c.content}</p>
                
                <button class="reply-btn" onclick="toggleReplyForm('${c.id}')"><i class="ph ph-arrow-bend-down-right"></i> Reply</button>
                
                <form id="reply-form-${c.id}" class="reply-form-container" onsubmit="handleAddComment(event, '${blogId}', '${c.id}', ${currentDepth + 1})">
                    <input type="text" id="reply-input-${c.id}" class="form-input" placeholder="Write a reply..." style="padding: 0.5rem 1rem; font-size: 0.9rem;" required>
                    <button type="submit" class="btn" style="width: auto; padding: 0.5rem 1rem; font-size: 0.9rem;">Reply</button>
                </form>
            </div>
            
            ${renderCommentTree(comments, blogId, c.id, currentDepth + 1)}
        `;
    }).join('');
}

function ProjectGalleryView() {
    // REPLACE your adminControls line inside ProjectGalleryView with this:
    const adminControls = currentUserRole === 'admin' 
        ? `<div style="text-align: right; padding: 0 2rem; max-width: 1200px; margin: 0 auto 2.5rem auto;">
             <button class="btn" style="width: auto;" onclick="window.location.hash='#/project/new'"><i class="ph ph-plus"></i> New Project</button>
           </div>` : '';

    let cardsHtml = MOCK_PROJECTS.map(proj => `
        <div class="card" onclick="window.location.hash = '#/project/${proj.id}'">
            <h3>${proj.name}</h3>
            <p>${proj.description}</p>
            <div style="margin-top: 1rem;">
                ${proj.allowedTags.map(tag => `<span class="tag ${getTagColorClass(tag, proj.allowedTags)}">${tag}</span>`).join(' ')}
            </div>
        </div>
    `).join('');

    return adminControls + `<div class="project-grid">${cardsHtml}</div>`;
}

function BlogGalleryView(projectId) {
    // Reset state if we navigated to a completely different project
    if (window.currentGalleryProjectId !== projectId) {
        window.galleryState = { filters: [], sortOrder: 'desc', searchQuery: '' };
        window.currentGalleryProjectId = projectId;
    }

    const project = MOCK_PROJECTS.find(p => p.id === projectId) || MOCK_PROJECTS[0];

    const headerHtml = `
        <div style="max-width: 1200px; margin: 0 auto 2rem auto; padding: 0 2rem;">
            <button class="btn" style="background: transparent; color: var(--text-muted); width: auto; padding: 0; margin-bottom: 1.5rem;" onclick="window.location.hash='#/'">
                <i class="ph ph-arrow-left"></i> Back to Projects
            </button>
            
            <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 2rem;">
                    
                    <div style="flex: 1; min-width: 300px;">
                        <h2 style="margin: 0; font-size: 1.8rem;">${project.name} Logs</h2>
                        
                        <p style="color: var(--text-muted); font-size: 0.95rem; margin: 0.5rem 0 1.25rem 0; line-height: 1.5; max-width: 600px;">
                            ${project.description}
                        </p>

                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <span style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted); letter-spacing: 0.5px;">ACCESS</span>
                            <div style="display: flex; align-items: center;">
                                ${project.members.map((m, i) => `
                                    <img src="${getUserIcon(m)}" title="${m}" 
                                         style="width: 30px; height: 30px; border-radius: 50%; border: 2px solid var(--bg-color); background: #e2e8f0; margin-left: ${i > 0 ? '-10px' : '0'}; position: relative; z-index: ${10 - i}; object-fit: cover; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <div style="flex: 1; min-width: 250px; max-width: 350px; position: relative;">
                        <i class="ph ph-magnifying-glass" style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: var(--text-muted);"></i>
                        <input type="text" class="form-input" placeholder="Search title or content..." style="padding-left: 2.5rem; margin: 0;" oninput="handleSearch(this.value)" value="${window.galleryState.searchQuery}">
                    </div>
                </div>
                
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; border-top: 1px solid #e2e8f0; padding-top: 1.5rem;">
                    <div style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
                        <select class="form-input" style="width: auto; padding: 0.5rem 1rem; height: auto; margin: 0;" onchange="changeSortOrder(this.value)">
                            <option value="desc" ${window.galleryState.sortOrder === 'desc' ? 'selected' : ''}>Newest First</option>
                            <option value="asc" ${window.galleryState.sortOrder === 'asc' ? 'selected' : ''}>Oldest First</option>
                        </select>

                        <details class="dropdown-filter" ${window.galleryState.filterOpen ? 'open' : ''}>
                            <summary class="btn" style="background: var(--surface-color); color: var(--text-main); border: 1px solid #e2e8f0; margin: 0;" onclick="toggleDropdownState()"><i class="ph ph-funnel"></i> Tags</summary>
                            <div class="dropdown-content">
                                <strong style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">Filter by Tags</strong>
                                <div class="scrollable-checklist" style="border: none; padding: 0; background: transparent; max-height: 200px;">
                                    ${project.allowedTags.map(tag => `
                                        <label class="checklist-item">
                                            <input type="checkbox" value="${tag}" ${window.galleryState.filters.includes(tag) ? 'checked' : ''} onchange="toggleGalleryFilter('${tag}')"> 
                                            <span class="tag ${getTagColorClass(tag, project.allowedTags)}" style="margin-top: 0;">${tag}</span>
                                        </label>
                                    `).join('')}
                                </div>
                            </div>
                        </details>
                    </div>

                    <div style="display: flex; gap: 0.75rem;">
                        ${currentUserRole === 'admin' ? `<button class="btn" style="background: var(--text-muted);" onclick="window.location.hash='#/settings/${projectId}'"><i class="ph ph-gear"></i> Settings</button>` : ''}
                        <button class="btn" onclick="window.location.hash='#/edit/${projectId}/new'"><i class="ph ph-pencil-simple"></i> New Log</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Inject the dynamically generated cards on initial load
    return headerHtml + `<div class="blog-masonry">${getBlogCardsHtml(projectId)}</div>`;
}

function BlogDetailView(projectId, blogId) {
    const project = MOCK_PROJECTS.find(p => p.id === projectId);
    const blog = MOCK_BLOGS.find(b => b.id === blogId);
    
    if (!blog || !project) return `<h2>Blog or Project not found</h2>`;

    const comments = MOCK_COMMENTS.filter(c => c.blogId === blogId);
    const commentsHtml = renderCommentTree(comments, blogId, null, 1);
    const canEdit = currentUserRole === 'admin' || currentUsername === blog.author;

    const attachmentsHtml = blog.attachments && blog.attachments.length > 0 
        ? `<div class="attachment-container">
            <div style="width: 100%; font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.5rem;">ATTACHMENTS (${blog.attachments.length})</div>
            ${blog.attachments.map(file => `
                <a href="${file.data}" download="${file.name}" class="attachment-item">
                    <i class="ph ph-file-pdf" style="font-size: 1.5rem; color: #ef4444;"></i>
                    <div class="attachment-info">
                        <strong>${file.name}</strong>
                        <span class="attachment-size">${(file.size / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                </a>
            `).join('')}
           </div>` : '';

    const historyHtml = blog.editHistory && blog.editHistory.length > 0 
        ? `<div style="margin-top: 3rem; border-top: 2px solid #edf2f7; padding-top: 1.5rem;">
             <h4 style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                <i class="ph ph-clock-counter-clockwise"></i> Version History
             </h4>
             <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                ${blog.editHistory.map(entry => `
                    <details class="history-item">
                        <summary class="history-summary">
                            <span><i class="ph ph-calendar-check"></i> Edited on ${formatFullDate(entry.timestamp)}</span>
                            <span class="history-badge">View Content <i class="ph ph-caret-down"></i></span>
                        </summary>
                        <div class="history-content-preview">
                            <strong>${entry.oldTitle}</strong>
                            <div style="margin-top:0.5rem;">${entry.oldContent}</div>
                        </div>
                    </details>
                `).join('')}
             </div>
           </div>` : '';

    return `
        <div class="card" style="max-width: 800px; margin: 0 auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <button class="btn" style="background: transparent; color: var(--text-muted); width: auto; padding: 0;" onclick="window.location.hash='#/project/${projectId}'">
                    <i class="ph ph-arrow-left"></i> Back to Logs
                </button>
                ${canEdit ? `<button class="btn" style="background: #edf2f7; color: var(--text-main); width: auto; padding: 0.5rem 1rem; font-size: 0.9rem;" onclick="window.location.hash='#/edit/${projectId}/${blog.id}'"><i class="ph ph-pencil-simple"></i> Edit Log</button>` : ''}
            </div>
            <h1 style="margin-bottom: 0.5rem;">${blog.title}</h1>
            <div class="blog-meta" style="margin-bottom: 2rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 1rem;">
                <span style="display: flex; align-items: center; gap: 0.5rem;">
                    <img src="${getUserIcon(blog.author)}" style="width: 24px; height: 24px; border-radius: 50%;"> 
                    Posted by <strong>${blog.author}</strong> on <strong>${formatFullDate(blog.date + 'T12:00:00')}</strong>
                </span>
                <div>${blog.tags.map(t => `<span class="tag ${getTagColorClass(t, project.allowedTags)}">${t}</span>`).join(' ')}</div>
            </div>
            <div style="line-height: 1.8;">${blog.content}</div>
            ${attachmentsHtml}
            ${historyHtml}
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 3rem 0 1rem 0;">
            <div class="comment-thread">
                <h3 style="margin-bottom: 1rem;"><i class="ph ph-chats"></i> Comments (${comments.length})</h3>
                <form id="add-comment-form" style="display: flex; gap: 1rem; margin-bottom: 2rem;">
                    <input type="text" id="new-comment-text" class="form-input" placeholder="Write a comment..." required>
                    <button type="submit" class="btn" style="width: auto;">Post</button>
                </form>
                ${commentsHtml}
            </div>
        </div>
    `;
}

function BlogEditorView(projectId, blogId = 'new') {
    const project = MOCK_PROJECTS.find(p => p.id === projectId);
    
    // Determine if we are editing or creating
    const isEditing = blogId !== 'new';
    const blog = isEditing ? MOCK_BLOGS.find(b => b.id === blogId) : null;

    // Set default values
    const defaultTitle = blog ? blog.title : '';
    const defaultContent = blog ? blog.content : '';
    const defaultPinned = blog ? blog.pinned : false;
    
    // Get today's date formatted perfectly for the input field (YYYY-MM-DD)
    const todayFormatted = new Date().toISOString().split('T')[0];
    const defaultDate = blog ? blog.date : todayFormatted;

    return `
        <div class="card" style="max-width: 800px; margin: 0 auto;">
             <button class="btn" style="background: transparent; color: var(--text-muted); width: auto; padding: 0; margin-bottom: 1rem;" onclick="window.history.back()">
                <i class="ph ph-arrow-left"></i> Cancel
            </button>
            <h2><i class="ph ph-pencil-simple"></i> ${isEditing ? 'Edit Log' : 'Write a Log'}</h2>
            
            <form id="save-log-form">
                <div style="display: flex; gap: 1rem; margin-bottom: 1.25rem;">
                    <div style="flex: 2;">
                        <input type="text" id="log-title" class="form-input" placeholder="Log Title..." value="${defaultTitle}" style="font-size: 1.5rem; font-weight: bold; border: none; border-bottom: 2px solid #e2e8f0; border-radius: 0; padding-left: 0; background: transparent;" required>
                    </div>
                    <div style="flex: 1; max-width: 200px;">
                        <input type="date" id="log-date" class="form-input" value="${defaultDate}" style="border: none; border-bottom: 2px solid #e2e8f0; border-radius: 0; background: transparent;" required>
                    </div>
                </div>
                
                <div class="form-group" style="position: relative;">
                    <div id="log-content" class="form-input editor-content" contenteditable="true" data-placeholder="Write your log content here... (You can paste images directly!)">${defaultContent}</div>
                </div>

                <div class="form-group" style="display: flex; gap: 2rem; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 250px;">
                        <label><i class="ph ph-tags"></i> Select Tags</label>
                        <div class="scrollable-checklist">
                            ${project ? project.allowedTags.map(tag => `
                                <label class="checklist-item">
                                    <input type="checkbox" class="tag-checkbox" value="${tag}" ${blog && blog.tags.includes(tag) ? 'checked' : ''}> ${tag}
                                </label>
                            `).join('') : '<p style="color: var(--text-muted); font-size: 0.8rem;">No tags configured for this project.</p>'}
                        </div>
                    </div>
                    
                    <div style="flex: 1; min-width: 250px;">
                        <label><i class="ph ph-file-pdf"></i> Attach PDF Documents</label>
                        <button type="button" class="btn" style="background: #edf2f7; color: var(--text-main); display: flex; align-items: center; gap: 0.5rem; justify-content: center;" onclick="document.getElementById('hidden-file-upload').click()">
                            <i class="ph ph-paperclip"></i> Select PDFs (Max 5MB each)
                        </button>
                        <input type="file" id="hidden-file-upload" accept=".pdf" multiple style="display: none;" onchange="handleFileSelection(event)">
                        <div id="file-list-preview" style="margin-top: 1rem; display: flex; flex-direction: column; gap: 0.5rem;">
                            </div>
                        <small id="file-error" style="color: #ef4444; display: block; margin-top: 0.5rem; font-size: 0.75rem;"></small>
                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2rem;">
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem;">
                        <input type="checkbox" id="log-pinned" ${defaultPinned ? 'checked' : ''}> Pin this log
                    </label>
                    <button type="submit" class="btn" style="width: auto;">${isEditing ? 'Save Changes' : 'Publish Log'}</button>
                </div>
            </form>
        </div>
    `;
}

function ProjectSettingsView(projectId) {
    const project = MOCK_PROJECTS.find(p => p.id === projectId);
    if (!project) return `<h2>Project not found</h2>`;

    // Generate checkboxes for all users, checking the ones who already have access
    const membersHtml = MOCK_USERS.map(u => `
        <label style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem; cursor: pointer;">
            <input type="checkbox" class="edit-proj-member" value="${u}" ${project.members.includes(u) ? 'checked' : ''}>
            <i class="ph ph-user"></i> ${u}
        </label>
    `).join('');

    return `
        <div class="card" style="max-width: 600px; margin: 0 auto;">
             <button class="btn" style="background: transparent; color: var(--text-muted); width: auto; padding: 0; margin-bottom: 1rem;" onclick="window.location.hash='#/project/${projectId}'">
                <i class="ph ph-arrow-left"></i> Back to Logs
            </button>
            <h2><i class="ph ph-gear"></i> Project Settings</h2>
            
            <form id="edit-project-form" style="margin-top: 1.5rem;">
                <div class="form-group">
                    <label>Project Name</label>
                    <input type="text" id="edit-proj-name" class="form-input" value="${project.name}" required>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea id="edit-proj-desc" class="form-input" rows="3" required>${project.description}</textarea>
                </div>
                <div class="form-group">
                    <label>Allowed Tags (comma separated)</label>
                    <input type="text" id="edit-proj-tags" class="form-input" value="${project.allowedTags.join(', ')}">
                    <small style="color: var(--text-muted);">Example: bug, feature, urgent, ui</small>
                </div>
                <div class="form-group">
                    <label>Manage Access</label>
                    <div class="scrollable-checklist" style="background: #ffffff;">
                        ${membersHtml}
                    </div>
                </div>
                <button type="submit" class="btn" style="margin-top: 1rem;">Save Changes</button>
            </form>
        </div>
    `;
}

function ProfileView() {
    window.tempSelectedIcon = currentUserIcon;
    
    // Check if the user's current icon is custom (not in our predefined list)
    const isCustom = !PREDEFINED_ICONS.includes(currentUserIcon);

    return `
        <div class="card" style="max-width: 500px; margin: 0 auto; margin-top: 2rem;">
            <h2><i class="ph ph-user-circle"></i> Edit Profile</h2>
            <p style="color: var(--text-muted); margin-bottom: 2rem;">Update your account credentials below.</p>
            
            <form id="edit-profile-form">
                
                <div class="form-group" style="text-align: center; margin-bottom: 2rem;">
                    <label style="text-align: left;">Choose Profile Icon</label>
                    
                    <div style="display: flex; gap: 1rem; flex-wrap: wrap; justify-content: center; margin-top: 1rem; align-items: center;">
                        ${PREDEFINED_ICONS.map(url => `
                            <img src="${url}"
                                 class="avatar-option"
                                 onclick="selectAvatar('${url}')"
                                 data-url="${url}"
                                 style="width: 55px; height: 55px; border-radius: 50%; cursor: pointer; border: 3px solid ${url === currentUserIcon && !isCustom ? 'var(--primary)' : 'transparent'}; background: #e2e8f0; padding: 4px; transition: border-color 0.2s;">
                        `).join('')}

                        <img id="custom-avatar-preview" 
                             src="${isCustom ? currentUserIcon : ''}" 
                             style="width: 55px; height: 55px; border-radius: 50%; cursor: pointer; border: 3px solid ${isCustom ? 'var(--primary)' : 'transparent'}; background: #e2e8f0; padding: 4px; display: ${isCustom ? 'inline-block' : 'none'}; object-fit: cover;"
                             onclick="selectAvatar(this.src)"
                             title="Your Custom Avatar">
                    </div>

                    <div style="margin-top: 1.5rem;">
                        <button type="button" class="btn" style="background: #edf2f7; color: var(--text-main); width: auto; font-size: 0.9rem;" onclick="document.getElementById('avatar-upload').click()">
                            <i class="ph ph-upload-simple"></i> Upload Custom Image
                        </button>
                        <input type="file" id="avatar-upload" accept="image/*" style="display: none;" onchange="handleAvatarUpload(event)">
                    </div>
                </div>

                <div class="form-group"><label>Username</label><input type="text" id="profile-username" class="form-input" value="${currentUsername}" required></div>
                
                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 2rem 0;">
                <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">Leave passwords blank if you don't want to change them.</p>

                <div class="form-group"><label>Current Password</label><input type="password" id="profile-current-password" class="form-input" placeholder="Enter current password..."></div>
                <div class="form-group"><label>New Password</label><input type="password" id="profile-password" class="form-input" placeholder="Enter new password..."></div>
                <div class="form-group"><label>Confirm New Password</label><input type="password" id="profile-confirm-password" class="form-input" placeholder="Confirm new password..."></div>
                
                <div id="profile-message" style="margin-bottom: 1rem; font-size: 0.9rem; font-weight: 500; display: flex; align-items: center; gap: 0.5rem;"></div>

                <button type="submit" class="btn">Save Changes</button>
            </form>
        </div>
    `;
}
// --- Auth & Routing Logic ---

function handleLogin(e) {
    e.preventDefault();
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;

    if ((user === 'admin' && pass === 'admin123') || (user === 'user' && pass === 'user123')) {
        const role = user === 'admin' ? 'admin' : 'user';
        localStorage.setItem('logTrackerToken', 'mock-token-' + role);
        localStorage.setItem('logTrackerRole', role);
        localStorage.setItem('logTrackerUsername', user);
        authToken = 'mock-token-' + role;
        currentUserRole = role;
        currentUsername = user;
        window.location.hash = '#/';
    } else {
        alert('Invalid credentials');
    }
}

function handleLogout() {
    localStorage.clear();
    authToken = null; currentUserRole = null; currentUsername = null;
    window.location.hash = '#/login';
}

// NEW: Generates a static color class based on the tag's text content
// UPDATED: Cycles colors perfectly based on the tag's position in the project's list
const getTagColorClass = (tagName, projectTags = []) => {
    let index = projectTags.indexOf(tagName);
    if (index === -1) index = 0; // Fallback if tag is somehow not in the list
    return `tag-c${index % 6}`;
};

// NEW: Helper function to generate filtered/sorted cards dynamically
function getBlogCardsHtml(projectId) {
    const project = MOCK_PROJECTS.find(p => p.id === projectId) || MOCK_PROJECTS[0];
    let blogs = MOCK_BLOGS.filter(b => b.projectId === projectId);

    // 1. Search Logic (Checks both title and content)
    if (window.galleryState.searchQuery) {
        const query = window.galleryState.searchQuery;
        blogs = blogs.filter(blog => 
            blog.title.toLowerCase().includes(query) || 
            blog.content.toLowerCase().includes(query)
        );
    }

    // 2. Filter Logic (Tags)
    if (window.galleryState.filters.length > 0) {
        blogs = blogs.filter(blog => 
            window.galleryState.filters.some(tag => blog.tags.includes(tag))
        );
    }

    // 3. Sort Logic
    blogs = blogs.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        const dateA = new Date(a.date).getTime() || 0;
        const dateB = new Date(b.date).getTime() || 0;
        return window.galleryState.sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

    let blogCards = blogs.map(blog => `
        <div class="card" onclick="window.location.hash='#/project/${projectId}/blog/${blog.id}'">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <h3 style="margin-top: 0; margin-bottom: 0.5rem; padding-right: 1rem; font-size: 1.1rem;">${blog.title}</h3>
                <button class="pin-btn ${blog.pinned ? 'pinned' : ''}" onclick="togglePin(event, '${blog.id}')" title="${blog.pinned ? 'Unpin' : 'Pin'}">
                    <i class="${blog.pinned ? 'ph-fill' : 'ph'} ph-push-pin" style="font-size: 1.25rem;"></i>
                </button>
            </div>
            <p>${blog.excerpt}</p>
            <div style="margin-top: 0.5rem;">
                ${blog.tags.map(t => `<span class="tag ${getTagColorClass(t, project.allowedTags)}">${t}</span>`).join(' ')}
            </div>
            <div class="blog-meta">
                <span style="display: flex; align-items: center; gap: 0.5rem;">
                    <img src="${getUserIcon(blog.author)}" style="width: 20px; height: 20px; border-radius: 50%; background: #e2e8f0;"> ${blog.author}
                </span>
                <div style="display: flex; gap: 1rem;">
                    <span style="display: flex; align-items: center; gap: 0.25rem;"><i class="ph ph-chat-circle"></i> ${getCommentCount(blog.id)}</span>
                    <span style="display: flex; align-items: center; gap: 0.25rem;"><i class="ph ph-calendar-blank"></i> ${formatFullDate(blog.date + 'T12:00:00').split('at')[0]}</span>
                </div>
            </div>
        </div>
    `).join('');

    return blogCards || '<p style="padding: 0 2rem; color: var(--text-muted); grid-column: 1 / -1;">No logs match your search or filters.</p>';
}

// NEW: Toggles pin state and stops the card from opening
window.togglePin = function(e, blogId) {
    e.stopPropagation(); // Stops the click from bubbling up to the card
    const blog = MOCK_BLOGS.find(b => b.id === blogId);
    if (blog) {
        blog.pinned = !blog.pinned;
        router(); // Re-render to show updated color and sorting
    }
};

function UserManagementView() {
    if (currentUserRole !== 'admin') return `<h2>Access Denied</h2>`;

    const userRows = MOCK_USERS.map(u => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; border-bottom: 1px solid #e2e8f0;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <img src="${getUserIcon(u)}" style="width: 32px; height: 32px; border-radius: 50%; background: #e2e8f0;">
                <div>
                    <strong>${u}</strong>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${u === 'admin' ? 'System Administrator' : 'Team Member'}</div>
                </div>
            </div>
            ${u !== 'admin' ? `<button class="btn" style="width: auto; background: #fee2e2; color: #ef4444; padding: 0.25rem 0.75rem; font-size: 0.8rem;" onclick="handleDeleteUser('${u}')">Remove</button>` : ''}
        </div>
    `).join('');

    return `
        <div style="max-width: 800px; margin: 0 auto; display: grid; grid-template-columns: 1fr 300px; gap: 2rem; padding: 0 2rem;">
            <div>
                <h2 style="margin-bottom: 1.5rem;"><i class="ph ph-users"></i> Team Members</h2>
                <div class="card" style="padding: 0;">
                    ${userRows}
                </div>
            </div>

            <div>
                <h2 style="margin-bottom: 1.5rem;">Add New User</h2>
                <div class="card">
                    <form id="create-user-form">
                        <div class="form-group">
                            <label>Username</label>
                            <input type="text" id="new-user-name" class="form-input" placeholder="e.g. jsmith" required>
                        </div>
                        <div class="form-group">
                            <label>Temporary Password</label>
                            <input type="text" id="new-user-pass" class="form-input" value="welcome123" required>
                        </div>
                        <button type="submit" class="btn">Create Account</button>
                    </form>
                    <div id="user-msg" style="margin-top: 1rem; font-size: 0.85rem;"></div>
                </div>
            </div>
        </div>
    `;
}

function router() {
    const hash = window.location.hash.slice(1) || '/';
    const pathSegments = hash.split('/').filter(Boolean);

    appRoot.innerHTML = ''; 

    if (!authToken && pathSegments[0] !== 'login') {
        window.location.hash = '#/login';
        return;
    }

    if (pathSegments[0] === 'login') {
        topNav.style.display = 'none';
        appRoot.innerHTML = LoginView();
        document.getElementById('login-form').addEventListener('submit', handleLogin);
        return;
    } 
    
    topNav.style.display = 'flex';
    
    // REPAIRED: Cleaned up the Nav Links logic
    const navLinksContainer = document.querySelector('.nav-links');
    const adminLink = currentUserRole === 'admin' ? `<a href="#/users"><i class="ph ph-users"></i> Users</a>` : '';
    
    navLinksContainer.innerHTML = `
        <a href="#/"><i class="ph ph-squares-four"></i> Projects</a>
        ${adminLink}
        <a href="#/profile"><i class="ph ph-user-circle"></i> Profile</a>
        <a href="#" id="logout-btn" onclick="handleLogout()" style="display: flex; align-items: center; gap: 0.5rem;">
            <img src="${currentUserIcon}" style="width: 20px; height: 20px; border-radius: 50%; background: #e2e8f0; object-fit: cover;"> Logout (${currentUsername})
        </a>
    `;

    // Routing Logic
    if (pathSegments.length === 0) {
        appRoot.innerHTML = ProjectGalleryView();
    } else if (pathSegments[0] === 'project' && pathSegments[1] === 'new') {
        appRoot.innerHTML = ProjectCreateView();
        document.getElementById('create-project-form').addEventListener('submit', handleCreateProject);
    } else if (pathSegments[0] === 'project' && pathSegments[2] === 'blog' && pathSegments[3]) {
        appRoot.innerHTML = BlogDetailView(pathSegments[1], pathSegments[3]);
        const commentForm = document.getElementById('add-comment-form');
        if(commentForm) commentForm.addEventListener('submit', (e) => handleAddComment(e, pathSegments[3]));
    } else if (pathSegments[0] === 'project' && pathSegments[1]) {
        appRoot.innerHTML = BlogGalleryView(pathSegments[1]);
    } else if (pathSegments[0] === 'settings' && pathSegments[1]) {
        appRoot.innerHTML = ProjectSettingsView(pathSegments[1]);
        const editForm = document.getElementById('edit-project-form');
        if (editForm) editForm.addEventListener('submit', (e) => handleEditProject(e, pathSegments[1]));
    } else if (pathSegments[0] === 'edit' && pathSegments[1]) {
        const blogId = pathSegments[2] || 'new';
        const blog = MOCK_BLOGS.find(b => b.id === blogId);
        window.tempUploadedFiles = blog ? [...(blog.attachments || [])] : [];
        appRoot.innerHTML = BlogEditorView(pathSegments[1], blogId);
        initializeRichTextEditor();
        if (window.tempUploadedFiles.length > 0) renderFilePreview(); 
        document.getElementById('save-log-form').addEventListener('submit', (e) => handleSaveLog(e, pathSegments[1], blogId));
    } else if (pathSegments[0] === 'profile') {
        appRoot.innerHTML = ProfileView();
        document.getElementById('edit-profile-form').addEventListener('submit', handleUpdateProfile);
    } else if (pathSegments[0] === 'users') {
        appRoot.innerHTML = UserManagementView();
        const userForm = document.getElementById('create-user-form');
        if (userForm) userForm.addEventListener('submit', handleCreateUser);
    } else {
        appRoot.innerHTML = `<div style="text-align: center; margin-top: 5rem;"><h2>404 - Not Found</h2></div>`;
    }
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);

// NEW: Helper to insert images into the contenteditable div
function insertImageToEditor(file) {
    if (!file || !file.type.startsWith('image/')) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        const base64String = event.target.result;
        // The safest vanilla JS way to insert HTML at the cursor position
        document.execCommand('insertImage', false, base64String);
    };
    reader.readAsDataURL(file);
}

// NEW: Attaches Paste and Upload listeners to the editor
function initializeRichTextEditor() {
    const editor = document.getElementById('log-content');
    const uploader = document.getElementById('hidden-image-upload');
    if (!editor) return;

    // Handle Manual Upload
    if (uploader) {
        uploader.addEventListener('change', (e) => {
            const file = e.target.files[0];
            insertImageToEditor(file);
            uploader.value = ''; // Reset input so you can upload the same image again if needed
        });
    }

    // Handle Copy/Paste
    editor.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let index in items) {
            const item = items[index];
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                e.preventDefault(); // Stop the browser from just pasting the filename
                const file = item.getAsFile();
                insertImageToEditor(file);
            }
        }
    });
}

// --- Profile Handlers ---

window.tempSelectedIcon = currentUserIcon;

window.selectAvatar = function(url) {
    window.tempSelectedIcon = url;
    document.querySelectorAll('.avatar-option').forEach(img => {
        img.style.borderColor = img.dataset.url === url ? 'var(--primary)' : 'transparent';
    });
    const customPreview = document.getElementById('custom-avatar-preview');
    if (customPreview) customPreview.style.borderColor = 'transparent';
};

window.handleAvatarUpload = function(event) {
    const file = event.target.files[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const base64String = e.target.result;
        window.tempSelectedIcon = base64String;

        const previewImg = document.getElementById('custom-avatar-preview');
        if (previewImg) {
            previewImg.src = base64String;
            previewImg.style.display = 'inline-block';
            previewImg.style.borderColor = 'var(--primary)';
        }
        document.querySelectorAll('.avatar-option').forEach(img => img.style.borderColor = 'transparent');
    };
    reader.readAsDataURL(file);
};


// NEW: Formats a date string into "Month DD, YYYY at HH:MM AM/PM"
const formatFullDate = (dateStr) => {
    if (!dateStr) return "Unknown";
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric', 
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true 
    });
};

// NEW: Holds the Base64 data of the files currently being uploaded
window.tempUploadedFiles = [];

window.handleFileSelection = function(event) {
    const files = Array.from(event.target.files);
    const errorDiv = document.getElementById('file-error');
    const previewDiv = document.getElementById('file-list-preview');
    errorDiv.textContent = '';

    const MAX_SINGLE_SIZE = 5 * 1024 * 1024; // 5MB
    const MAX_TOTAL_SIZE = 15 * 1024 * 1024; // 15MB
    
    let currentTotalSize = window.tempUploadedFiles.reduce((acc, f) => acc + f.size, 0);

    files.forEach(file => {
        if (file.type !== 'application/pdf') {
            errorDiv.textContent = 'Only PDF files are allowed.';
            return;
        }
        if (file.size > MAX_SINGLE_SIZE) {
            errorDiv.textContent = `File "${file.name}" exceeds the 5MB limit.`;
            return;
        }
        if (currentTotalSize + file.size > MAX_TOTAL_SIZE) {
            errorDiv.textContent = 'Total upload size exceeds 15MB.';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const fileData = {
                name: file.name,
                size: file.size,
                data: e.target.result // Base64 string
            };
            window.tempUploadedFiles.push(fileData);
            currentTotalSize += file.size;
            renderFilePreview();
        };
        reader.readAsDataURL(file);
    });
};

function renderFilePreview() {
    const previewDiv = document.getElementById('file-list-preview');
    previewDiv.innerHTML = window.tempUploadedFiles.map((f, i) => `
        <div style="display: flex; justify-content: space-between; align-items: center; background: #f1f5f9; padding: 0.5rem; border-radius: 6px; font-size: 0.8rem;">
            <span><i class="ph ph-file-pdf"></i> ${f.name}</span>
            <button type="button" onclick="window.tempUploadedFiles.splice(${i}, 1); renderFilePreview();" style="border:none; background:none; color:#ef4444; cursor:pointer;"><i class="ph ph-x"></i></button>
        </div>
    `).join('');
}

window.handleDeleteUser = function(username) {
    if (!confirm(`Are you sure you want to remove ${username}?`)) return;
    const index = MOCK_USERS.indexOf(username);
    if (index > -1) {
        MOCK_USERS.splice(index, 1);
        delete MOCK_USER_PROFILES[username];
        router();
    }
};

function handleCreateUser(e) {
    e.preventDefault();
    const name = document.getElementById('new-user-name').value.trim().toLowerCase();
    const msg = document.getElementById('user-msg');

    if (MOCK_USERS.includes(name)) {
        msg.style.color = '#ef4444';
        msg.textContent = 'User already exists!';
        return;
    }

    // Add to our mock database
    MOCK_USERS.push(name);
    // Assign a random robot icon from our predefined list
    MOCK_USER_PROFILES[name] = PREDEFINED_ICONS[Math.floor(Math.random() * PREDEFINED_ICONS.length)];

    msg.style.color = '#10b981';
    msg.textContent = `User ${name} created!`;
    
    document.getElementById('create-user-form').reset();
    router(); // Refresh the list
}