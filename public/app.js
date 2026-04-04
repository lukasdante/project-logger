const appRoot = document.getElementById('app-root');
const topNav = document.querySelector('.top-nav');
const API_BASE = '/api';

// --- Global State ---
let authToken = localStorage.getItem('logTrackerToken');
let currentUserRole = localStorage.getItem('logTrackerRole'); 
let currentUsername = localStorage.getItem('logTrackerUsername') || 'Guest';
let currentUserIcon = localStorage.getItem('logTrackerIcon');

window.CURRENT_PROJECTS = [];
window.CURRENT_BLOGS = [];
window.CURRENT_COMMENTS = []; // NEW: Live data container for comments!

// --- Real API Helper ---
async function apiFetch(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}) };
    const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    const data = await response.json();
    if (!response.ok) {
        if (response.status === 401) handleLogout();
        throw new Error(data.error || 'API Error');
    }
    return data;
}

// --- Icons & Self-Hydrating Cache ---
const PREDEFINED_ICONS = [
    'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=admin', 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=user',
    'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=dan', 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=diane',
    'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=eva', 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=frank'
];

window.avatarCache = {}; 
const getUserIcon = (username) => {
    if (username === currentUsername && currentUserIcon) { window.avatarCache[username] = currentUserIcon; return currentUserIcon; }
    if (window.avatarCache[username] && window.avatarCache[username] !== 'fetching') return window.avatarCache[username];
    if (!window.avatarCache[username]) {
        window.avatarCache[username] = 'fetching'; 
        apiFetch(`/avatars/${username}`).then(data => {
            window.avatarCache[username] = data.image; 
            document.querySelectorAll(`img[data-user="${username}"]`).forEach(img => { img.src = data.image; });
        }).catch(() => {
            const fallback = `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${username}`;
            window.avatarCache[username] = fallback;
            document.querySelectorAll(`img[data-user="${username}"]`).forEach(img => { img.src = fallback; });
        });
    }
    return `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${username}`;
};

// --- Helper Functions for Data ---
const getCommentCount = (blogId) => window.CURRENT_COMMENTS.filter(c => c.blogId === blogId).length;
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

// --- Gallery UI State Handlers ---
window.currentGalleryProjectId = null;
window.galleryState = { filters: [], sortOrder: 'desc', searchQuery: '' };

window.updateGalleryView = function() {
    const masonry = document.querySelector('.blog-masonry');
    if (masonry) masonry.innerHTML = getBlogCardsHtml(window.currentGalleryProjectId);
};
window.toggleGalleryFilter = function(tag) {
    if (window.galleryState.filters.includes(tag)) window.galleryState.filters = window.galleryState.filters.filter(t => t !== tag);
    else window.galleryState.filters.push(tag);
    window.updateGalleryView(); 
};
window.changeSortOrder = function(order) { window.galleryState.sortOrder = order; window.updateGalleryView(); };
window.handleSearch = function(query) { window.galleryState.searchQuery = query.toLowerCase(); window.updateGalleryView(); };

window.togglePin = async function(e, blogId, projectId) {
    e.stopPropagation();
    const blog = window.CURRENT_BLOGS.find(b => b.id === blogId);
    
    if (blog) {
        if (!blog.pinnedBy) blog.pinnedBy = [];
        
        // Check if the CURRENT user has it pinned
        const currentlyPinned = blog.pinnedBy.includes(currentUsername);
        const newPinnedStatus = !currentlyPinned;

        // Optimistic UI Update
        if (newPinnedStatus) {
            blog.pinnedBy.push(currentUsername);
        } else {
            blog.pinnedBy = blog.pinnedBy.filter(u => u !== currentUsername);
        }
        
        window.updateGalleryView(); 

        try {
            await apiFetch(`/projects/${projectId}/blogs/${blogId}/pin`, {
                method: 'POST',
                body: JSON.stringify({ username: currentUsername, isPinned: newPinnedStatus })
            });
        } catch(err) {
            // Revert on failure
            if (currentlyPinned) blog.pinnedBy.push(currentUsername);
            else blog.pinnedBy = blog.pinnedBy.filter(u => u !== currentUsername);
            window.updateGalleryView();
            alert("Failed to pin log: " + err.message);
        }
    }
};

// --- Form Submission Handlers ---
async function handleCreateProject(e) {
    e.preventDefault();
    const name = document.getElementById('proj-name').value;
    const desc = document.getElementById('proj-desc').value;
    const tagsInput = document.getElementById('proj-tags').value;
    const tagsArray = tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    const membersArray = Array.from(document.querySelectorAll('.create-proj-member:checked')).map(cb => cb.value);
    
    try {
        await apiFetch('/projects', { method: 'POST', body: JSON.stringify({ id: generateId(), name: name, description: desc, allowedTags: tagsArray, members: membersArray }) });
        window.location.hash = '#/'; 
    } catch (err) { alert("Failed to create project: " + err.message); }
}

async function handleEditProject(e, projectId) {
    e.preventDefault(); 
    const name = document.getElementById('edit-proj-name').value;
    const desc = document.getElementById('edit-proj-desc').value;
    const tagsInput = document.getElementById('edit-proj-tags').value;
    const membersArray = Array.from(document.querySelectorAll('.edit-proj-member:checked')).map(cb => cb.value);
    const tagsArray = tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);

    try {
        await apiFetch(`/projects/${projectId}`, { method: 'PUT', body: JSON.stringify({ name: name, description: desc, allowedTags: tagsArray, members: membersArray }) });
        window.location.hash = `#/project/${projectId}`;
    } catch (err) { alert("Failed to update project: " + err.message); }
}

window.handleDeleteProject = async function(projectId, projectName) {
    if (!confirm(`Are you sure you want to permanently delete "${projectName}"? This action cannot be undone.`)) return;
    try { await apiFetch(`/projects/${projectId}`, { method: 'DELETE' }); window.location.hash = '#/'; } catch (err) { alert("Failed to delete project: " + err.message); }
};

async function handleSaveLog(e, projectId, blogId) {
    e.preventDefault();
    const title = document.getElementById('log-title').value;
    const content = document.getElementById('log-content').innerHTML;
    const dateValue = document.getElementById('log-date').value;
    const isPinned = document.getElementById('log-pinned').checked;
    const now = new Date().toISOString();
    const tags = Array.from(document.querySelectorAll('.tag-checkbox:checked')).map(cb => cb.value);

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    const rawText = tempDiv.textContent || tempDiv.innerText || "";
    const excerpt = rawText.substring(0, 70) + (rawText.length > 70 ? '...' : '');

    const finalBlogId = blogId === 'new' ? generateId() : blogId;

    try {
        // --- R2 ATTACHMENT UPLOAD LOGIC ---
        const uploadedAttachments = [];
        
        // Check for removed attachments during an edit
        if (blogId !== 'new') {
            const oldBlog = window.CURRENT_BLOGS.find(b => b.id === blogId);
            const oldKeys = (oldBlog.attachments || []).map(a => a.key);
            const remainingKeys = window.tempUploadedFiles.filter(f => !f.isNew).map(f => f.key);
            const deletedKeys = oldKeys.filter(k => !remainingKeys.includes(k));
            
            // Delete removed files from R2
            for (const k of deletedKeys) {
                await apiFetch(`/attachments/${k}`, { method: 'DELETE' });
            }
        }

        // Upload new files to R2
        for (const file of window.tempUploadedFiles) {
            if (file.isNew) {
                const res = await apiFetch('/attachments', {
                    method: 'POST',
                    body: JSON.stringify({ blogId: finalBlogId, name: file.name, type: file.type, base64Data: file.data })
                });
                uploadedAttachments.push({ name: res.name, key: res.key, type: res.type }); // Only save the R2 Key!
            } else {
                uploadedAttachments.push(file); // Keep existing ones
            }
        }
        // ----------------------------------

        if (blogId === 'new') {
            await apiFetch(`/projects/${projectId}/blogs`, { 
                method: 'POST', 
                body: JSON.stringify({ id: finalBlogId, title: title, excerpt: excerpt, content: content, tags: tags, pinned: isPinned, author: currentUsername, date: dateValue, createdAt: now, attachments: uploadedAttachments }) 
            });
            window.tempUploadedFiles = [];
            window.location.hash = `#/project/${projectId}/blog/${finalBlogId}`;
        } else {
            const oldBlog = window.CURRENT_BLOGS.find(b => b.id === blogId);
            const updatedHistory = oldBlog.editHistory ? [...oldBlog.editHistory] : [];
            updatedHistory.unshift({ timestamp: now, oldTitle: oldBlog.title, oldContent: oldBlog.content, oldTags: oldBlog.tags, oldDate: oldBlog.date });

            await apiFetch(`/projects/${projectId}/blogs/${blogId}`, { 
                method: 'PUT', 
                body: JSON.stringify({ title: title, excerpt: excerpt, content: content, tags: tags, pinned: isPinned, date: dateValue, editHistory: updatedHistory, attachments: uploadedAttachments }) 
            });
            window.tempUploadedFiles = [];
            window.location.hash = `#/project/${projectId}/blog/${blogId}`;
        }
    } catch(err) { alert("Failed to save log: " + err.message); }
}

// NEW: Attachment File Handler
window.handleAttachmentUpload = function(event) {
    const files = event.target.files;
    if (!window.tempUploadedFiles) window.tempUploadedFiles = [];
    
    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            // isNew tells the save function to upload this to R2!
            window.tempUploadedFiles.push({ name: file.name, data: e.target.result, type: file.type, isNew: true });
            window.renderAttachmentPreview();
        };
        reader.readAsDataURL(file);
    });
    event.target.value = ''; 
};

// Native Browser Download!
window.downloadAttachment = function(key, filename) {
    const a = document.createElement('a');
    // Point directly to our new backend streaming route
    a.href = `${API_BASE}/attachments/${encodeURIComponent(key)}`;
    a.download = filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// LIVE COMMENTS LOGIC
window.toggleReplyForm = function(commentId) {
    const form = document.getElementById('reply-form-' + commentId);
    form.style.display = form.style.display === 'none' ? 'flex' : 'none';
};

async function handleAddComment(e, projectId, blogId, parentId = null, depth = 1) {
    e.preventDefault();
    const inputId = parentId ? `reply-input-${parentId}` : 'new-comment-text';
    const input = document.getElementById(inputId);
    if (!input.value.trim()) return;

    const newComment = {
        id: generateId(), blogId: blogId, parentId: parentId,
        author: currentUsername, content: input.value,
        date: new Date().toISOString(), depth: Math.min(depth, 3)
    };

    try {
        await apiFetch(`/projects/${projectId}/blogs/${blogId}/comments`, { method: 'POST', body: JSON.stringify(newComment) });
        window.CURRENT_COMMENTS.push(newComment); // Optimistic UI Update
        router(); 
    } catch (err) { alert("Failed to post comment: " + err.message); }
}

// --- User Management & Profile Handlers ---
async function handleUpdateProfile(e) {
    e.preventDefault();
    const newUsername = document.getElementById('profile-username').value.trim();
    const currentPass = document.getElementById('profile-current-password').value;
    const newPass = document.getElementById('profile-password').value;
    const confirmPass = document.getElementById('profile-confirm-password').value;
    const msgDiv = document.getElementById('profile-message');

    if (window.tempSelectedIcon && window.tempSelectedIcon !== currentUserIcon) {
            try {
                await apiFetch('/avatars', { method: 'POST', body: JSON.stringify({ username: currentUsername, base64Image: window.tempSelectedIcon }) });
                currentUserIcon = window.tempSelectedIcon;
                window.avatarCache[currentUsername] = currentUserIcon; 
                localStorage.setItem('logTrackerIcon', currentUserIcon); // NEW: Save new icon to memory!
            } catch (err) { console.error("Failed to upload avatar", err); }
        }

    if (newPass && newPass !== confirmPass) { msgDiv.style.color = '#ef4444'; msgDiv.innerHTML = '<i class="ph ph-warning-circle"></i> New passwords do not match!'; return; }

    if (newUsername !== currentUsername || newPass) {
        try {
            await apiFetch('/profile', { method: 'PUT', body: JSON.stringify({ currentUsername, newUsername, currentPass, newPass }) });
            if (newUsername !== currentUsername) {
                window.CURRENT_COMMENTS.forEach(comment => { if (comment.author === currentUsername) comment.author = newUsername; });
                window.CURRENT_BLOGS.forEach(blog => { if (blog.author === currentUsername) blog.author = newUsername; });
                currentUsername = newUsername;
                localStorage.setItem('logTrackerUsername', newUsername);
            }
            msgDiv.style.color = '#10b981'; msgDiv.innerHTML = '<i class="ph ph-check-circle"></i> Profile & Password updated!';
        } catch (err) { msgDiv.style.color = '#ef4444'; msgDiv.innerHTML = `<i class="ph ph-warning-circle"></i> ${err.message}`; return; }
    } else { msgDiv.style.color = '#10b981'; msgDiv.innerHTML = '<i class="ph ph-check-circle"></i> Profile updated!'; }
    
    document.getElementById('profile-current-password').value = '';
    document.getElementById('profile-password').value = '';
    document.getElementById('profile-confirm-password').value = '';
    router(); 
    setTimeout(() => { if(msgDiv) msgDiv.textContent = ''; }, 3000);
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    try {
        const data = await apiFetch('/login', { method: 'POST', body: JSON.stringify({ username, password }) });
        
        localStorage.setItem('logTrackerToken', data.token); 
        localStorage.setItem('logTrackerRole', data.user.role); 
        localStorage.setItem('logTrackerUsername', data.user.username);
        
        authToken = data.token; 
        currentUserRole = data.user.role; 
        currentUsername = data.user.username;
        
        try {
            const avatarData = await apiFetch(`/avatars/${currentUsername}`);
            currentUserIcon = avatarData.image; 
            window.avatarCache[currentUsername] = currentUserIcon;
            
            // NEW: Saves custom avatar so it survives a page refresh!
            localStorage.setItem('logTrackerIcon', currentUserIcon); 
        } catch (e) { 
            currentUserIcon = `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${currentUsername}`; 
            window.avatarCache[currentUsername] = currentUserIcon; 
            
            // NEW: Saves default avatar so it survives a page refresh!
            localStorage.setItem('logTrackerIcon', currentUserIcon); 
        }
        
        window.location.hash = '#/';
    } catch (err) { 
        alert(err.message); 
    }
}

function handleLogout() { localStorage.clear(); authToken = null; currentUserRole = null; currentUsername = null; window.avatarCache = {}; window.location.hash = '#/login'; }

async function handleCreateUser(e) {
    e.preventDefault();
    const name = document.getElementById('new-user-name').value.trim().toLowerCase();
    const pass = document.getElementById('new-user-pass').value;
    const msg = document.getElementById('user-msg');
    try {
        await apiFetch('/users', { method: 'POST', body: JSON.stringify({ username: name, password: pass }) });
        msg.style.color = '#10b981'; msg.textContent = `User ${name} created!`;
        document.getElementById('create-user-form').reset(); router(); 
    } catch(err) { msg.style.color = '#ef4444'; msg.textContent = err.message; }
}

window.handleDeleteUser = async function(username) {
    if (!confirm(`Are you sure you want to remove ${username}?`)) return;
    try { await apiFetch(`/users/${username}`, { method: 'DELETE' }); router(); } catch(err) { alert(err.message); }
};

window.handleAvatarUpload = function(event) {
    const file = event.target.files[0];
    if (!file || !file.type.startsWith('image/')) { alert('Please select a valid image file.'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
        const base64String = e.target.result; window.tempSelectedIcon = base64String;
        const previewImg = document.getElementById('custom-avatar-preview');
        if (previewImg) { previewImg.src = base64String; previewImg.style.display = 'inline-block'; previewImg.style.borderColor = 'var(--primary)'; }
        document.querySelectorAll('.avatar-option').forEach(img => img.style.borderColor = 'transparent');
    };
    reader.readAsDataURL(file);
};

// --- Views ---
function LoginView() {
    return `<div style="min-height: 80vh; display: flex; align-items: center; justify-content: center;"><div class="card" style="width: 100%; max-width: 400px;"><h2 style="text-align: center; margin-bottom: 0.5rem;"><i class="ph ph-lock-key"></i> Login</h2><form id="login-form"><div class="form-group"><label>Username</label><input type="text" id="username" class="form-input" required></div><div class="form-group"><label>Password</label><input type="password" id="password" class="form-input" required></div><button type="submit" class="btn">Log In</button></form></div></div>`;
}

function ProjectGalleryView() {
    const adminControls = currentUserRole === 'admin' ? `<div style="text-align: right; padding: 0 2rem; max-width: 1200px; margin: 0 auto 2.5rem auto;"><button class="btn" style="width: auto;" onclick="window.location.hash='#/project/new'"><i class="ph ph-plus"></i> New Project</button></div>` : '';
    const visibleProjects = window.CURRENT_PROJECTS.filter(proj => currentUserRole === 'admin' || proj.members.includes(currentUsername));
    let cardsHtml = visibleProjects.map(proj => `<div class="card" onclick="window.location.hash = '#/project/${proj.id}'"><h3>${proj.name}</h3><p>${proj.description}</p><div style="margin-top: 1rem;">${proj.allowedTags.map(tag => `<span class="tag ${getTagColorClass(tag, proj.allowedTags)}">${tag}</span>`).join(' ')}</div></div>`).join('');
    if (visibleProjects.length === 0) cardsHtml = `<div style="text-align: center; padding: 3rem; grid-column: 1 / -1; color: var(--text-muted);"><i class="ph ph-folder-dashed" style="font-size: 3rem; margin-bottom: 1rem; display: block;"></i><p>You don't have access to any projects yet.</p></div>`;
    return adminControls + `<div class="project-grid">${cardsHtml}</div>`;
}

function ProjectCreateView(dbUsers = []) {
    const standardUsers = dbUsers.filter(u => u.role !== 'admin');
    const membersHtml = standardUsers.map(u => `<label style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem; cursor: pointer;"><input type="checkbox" class="create-proj-member" value="${u.username}"><i class="ph ph-user"></i> ${u.username}</label>`).join('');
    return `<div class="card" style="max-width: 600px; margin: 0 auto;"><button class="btn" style="background: transparent; color: var(--text-muted); width: auto; padding: 0; margin-bottom: 1rem;" onclick="window.location.hash='#/'"><i class="ph ph-arrow-left"></i> Back to Projects</button><h2><i class="ph ph-folder-plus"></i> Create New Project</h2><form id="create-project-form" style="margin-top: 1.5rem;"><div class="form-group"><label>Project Name</label><input type="text" id="proj-name" class="form-input" required></div><div class="form-group"><label>Description</label><textarea id="proj-desc" class="form-input" rows="3" required></textarea></div><div class="form-group"><label>Allowed Tags</label><input type="text" id="proj-tags" class="form-input" placeholder="e.g. bug, feature, urgent"></div><div class="form-group"><label>Manage Access <span style="font-size: 0.8rem; font-weight: normal; color: var(--text-muted);">(Admins automatically have full access)</span></label><div class="scrollable-checklist" style="background: #ffffff;">${membersHtml || '<p style="color: var(--text-muted); font-size: 0.85rem;">No standard users exist yet.</p>'}</div></div><button type="submit" class="btn" style="margin-top: 1rem;">Create Project</button></form></div>`;
}

function BlogGalleryView(projectId, dbUsers = []) {
    if (window.currentGalleryProjectId !== projectId) { window.galleryState = { filters: [], sortOrder: 'desc', searchQuery: '' }; window.currentGalleryProjectId = projectId; }
    const project = window.CURRENT_PROJECTS.find(p => p.id === projectId);
    if (!project) return `<div style="text-align: center; margin-top: 5rem;"><h2>Project not found</h2></div>`;
    if (currentUserRole !== 'admin' && !project.members.includes(currentUsername)) return `<div style="text-align: center; margin-top: 5rem; color: #ef4444;"><h2><i class="ph ph-lock-key"></i> Access Denied</h2></div>`;

    const admins = dbUsers.filter(u => u.role === 'admin').map(u => u.username);
    const allAccessMembers = [...new Set([...admins, ...project.members])];

    const headerHtml = `
        <div style="max-width: 1200px; margin: 0 auto 2rem auto; padding: 0 2rem;">
            <button class="btn" style="background: transparent; color: var(--text-muted); width: auto; padding: 0; margin-bottom: 1.5rem;" onclick="window.location.hash='#/'"><i class="ph ph-arrow-left"></i> Back to Projects</button>
            <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 2rem;">
                    <div style="flex: 1; min-width: 300px;"><h2 style="margin: 0; font-size: 1.8rem;">${project.name} Logs</h2><p style="color: var(--text-muted); font-size: 0.95rem; margin: 0.5rem 0 1.25rem 0; line-height: 1.5; max-width: 600px;">${project.description}</p><div style="display: flex; align-items: center; gap: 0.75rem;"><span style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted); letter-spacing: 0.5px;">ACCESS</span><div style="display: flex; align-items: center;">${allAccessMembers.map((m, i) => `<img src="${getUserIcon(m)}" data-user="${m}" title="${m}" style="width: 30px; height: 30px; border-radius: 50%; border: 2px solid var(--bg-color); background: #e2e8f0; margin-left: ${i > 0 ? '-10px' : '0'}; position: relative; z-index: ${10 - i}; object-fit: cover;">`).join('')}</div></div></div>
                    <div style="flex: 1; min-width: 250px; max-width: 350px; position: relative;"><i class="ph ph-magnifying-glass" style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: var(--text-muted);"></i><input type="text" class="form-input" placeholder="Search logs..." style="padding-left: 2.5rem; margin: 0;" oninput="handleSearch(this.value)" value="${window.galleryState.searchQuery}"></div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; border-top: 1px solid #e2e8f0; padding-top: 1.5rem;">
                    <div style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;"><select class="form-input" style="width: auto; padding: 0.5rem 1rem; height: auto; margin: 0;" onchange="changeSortOrder(this.value)"><option value="desc" ${window.galleryState.sortOrder === 'desc' ? 'selected' : ''}>Newest First</option><option value="asc" ${window.galleryState.sortOrder === 'asc' ? 'selected' : ''}>Oldest First</option></select><details class="dropdown-filter" ${window.galleryState.filterOpen ? 'open' : ''}><summary class="btn" style="background: var(--surface-color); color: var(--text-main); border: 1px solid #e2e8f0; margin: 0;"><i class="ph ph-funnel"></i> Tags</summary><div class="dropdown-content"><strong style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">Filter by Tags</strong><div class="scrollable-checklist" style="border: none; padding: 0; background: transparent; max-height: 200px;">${project.allowedTags.map(tag => `<label class="checklist-item"><input type="checkbox" value="${tag}" ${window.galleryState.filters.includes(tag) ? 'checked' : ''} onchange="toggleGalleryFilter('${tag}')"> <span class="tag ${getTagColorClass(tag, project.allowedTags)}" style="margin-top: 0;">${tag}</span></label>`).join('')}</div></div></details></div>
                    <div style="display: flex; gap: 0.75rem;">${currentUserRole === 'admin' ? `<button class="btn" style="background: var(--text-muted);" onclick="window.location.hash='#/settings/${projectId}'"><i class="ph ph-gear"></i> Settings</button>` : ''}<button class="btn" onclick="window.location.hash='#/edit/${projectId}/new'"><i class="ph ph-pencil-simple"></i> New Log</button></div>
                </div>
            </div>
        </div>
    `;
    return headerHtml + `<div class="blog-masonry">${getBlogCardsHtml(projectId)}</div>`;
}

// RENDERING COMMENTS WITH @USERNAME TAGS
function renderCommentTree(comments, projectId, blogId, parentId = null, currentDepth = 1) {
    const children = comments.filter(c => c.parentId === parentId);
    if (children.length === 0) return '';
    return children.map(c => {
        // MAGIC TAG: Find the parent comment, if it exists, grab their name!
        const parentComment = comments.find(p => p.id === c.parentId);
        const replyTagHtml = parentComment ? `<span style="color: var(--primary); font-weight: 600; margin-right: 6px; background: #e0f2fe; padding: 2px 6px; border-radius: 4px; font-size: 0.85rem;">@${parentComment.author}</span>` : '';
        const displayDate = c.date.includes('T') ? formatFullDate(c.date) : c.date;

        return `
            <div class="comment ${Math.min(currentDepth, 3) > 1 ? 'comment-depth-' + Math.min(currentDepth, 3) : ''}">
                <div class="comment-meta"><div class="comment-avatar"><img src="${getUserIcon(c.author)}" data-user="${c.author}" style="width:100%; height:100%; border-radius:50%; object-fit: cover;"></div><strong>${c.author}</strong> • ${displayDate}</div>
                <p style="margin-top: 0.5rem;">${replyTagHtml}${c.content}</p>
                <button class="reply-btn" onclick="toggleReplyForm('${c.id}')"><i class="ph ph-arrow-bend-down-right"></i> Reply</button>
                <form id="reply-form-${c.id}" class="reply-form-container" onsubmit="handleAddComment(event, '${projectId}', '${blogId}', '${c.id}', ${currentDepth + 1})">
                    <input type="text" id="reply-input-${c.id}" class="form-input" placeholder="Reply to ${c.author}..." style="padding: 0.5rem 1rem; font-size: 0.9rem;" required>
                    <button type="submit" class="btn" style="width: auto; padding: 0.5rem 1rem; font-size: 0.9rem;">Reply</button>
                </form>
            </div>
            ${renderCommentTree(comments, projectId, blogId, c.id, currentDepth + 1)}
        `;
    }).join('');
}

function BlogDetailView(projectId, blogId) {
    const project = window.CURRENT_PROJECTS.find(p => p.id === projectId);
    if (project && currentUserRole !== 'admin' && !project.members.includes(currentUsername)) return `<div style="text-align: center; margin-top: 5rem; color: #ef4444;"><h2><i class="ph ph-lock-key"></i> Access Denied</h2></div>`;
    const blog = window.CURRENT_BLOGS.find(b => b.id === blogId);
    if (!blog || !project) return `<div style="text-align: center; margin-top: 5rem;"><h2>Blog or Project not found</h2></div>`;

    const comments = window.CURRENT_COMMENTS.filter(c => c.blogId === blogId);
    const commentsHtml = renderCommentTree(comments, projectId, blogId, null, 1); 
    const canEdit = currentUserRole === 'admin' || currentUsername === blog.author;

    // Render Attachments
    const attachmentsHtml = blog.attachments && blog.attachments.length > 0 
        ? `<div style="margin-top: 2rem; padding: 1rem; background: var(--surface-color); border-radius: 8px;">
            <strong><i class="ph ph-paperclip"></i> Attachments</strong><br>
            ${blog.attachments.map(f => `
                <a href="javascript:void(0)" onclick="downloadAttachment('${f.key}', '${f.name}')" class="tag" style="background: #e0f2fe; color: #0284c7; display: inline-block; margin-top: 0.5rem; text-decoration: none;">
                    <i class="ph ph-download-simple"></i> ${f.name}
                </a> 
            `).join('')}
           </div>` 
        : '';

    // Render Edit History
    // Render Edit History with Actual Content
    const historyHtml = blog.editHistory && blog.editHistory.length > 0
        ? `<details style="margin-top: 2rem; font-size: 0.85rem; color: var(--text-muted);">
            <summary style="cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                <i class="ph ph-clock-counter-clockwise"></i> Edited ${blog.editHistory.length} time(s)
            </summary>
            <div style="padding-top: 1rem; margin-top: 0.5rem; border-top: 1px dashed #e2e8f0; display: flex; flex-direction: column; gap: 1rem;">
                ${blog.editHistory.map(h => `
                    <div style="background: #f8fafc; padding: 1rem; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <div style="margin-bottom: 0.5rem; font-weight: 600; color: var(--text-main);">Previous version from ${formatFullDate(h.timestamp)}</div>
                        <div style="margin-bottom: 0.5rem;"><strong>Title:</strong> ${h.oldTitle}</div>
                        ${h.oldTags && h.oldTags.length > 0 ? `<div style="margin-bottom: 0.5rem;"><strong>Tags:</strong> ${h.oldTags.join(', ')}</div>` : ''}
                        <div style="background: white; padding: 0.75rem; border: 1px solid #e2e8f0; border-radius: 4px; line-height: 1.6; max-height: 200px; overflow-y: auto;">
                            ${h.oldContent}
                        </div>
                    </div>
                `).join('')}
            </div>
           </details>`
        : '';

    return `
        <div class="card" style="max-width: 800px; margin: 0 auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;"><button class="btn" style="background: transparent; color: var(--text-muted); width: auto; padding: 0;" onclick="window.location.hash='#/project/${projectId}'"><i class="ph ph-arrow-left"></i> Back to Logs</button>${canEdit ? `<button class="btn" style="background: #edf2f7; color: var(--text-main); width: auto; padding: 0.5rem 1rem; font-size: 0.9rem;" onclick="window.location.hash='#/edit/${projectId}/${blog.id}'"><i class="ph ph-pencil-simple"></i> Edit Log</button>` : ''}</div>
            <h1 style="margin-bottom: 0.5rem;">${blog.title}</h1>
            <div class="blog-meta" style="margin-bottom: 2rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 1rem;"><span style="display: flex; align-items: center; gap: 0.5rem;"><img src="${getUserIcon(blog.author)}" data-user="${blog.author}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;"> Posted by <strong>${blog.author}</strong> on <strong>${formatFullDate(blog.createdAt || blog.date)}</strong></span><div>${blog.tags.map(t => `<span class="tag ${getTagColorClass(t, project.allowedTags)}">${t}</span>`).join(' ')}</div></div>
            <div style="line-height: 1.8;">${blog.content}</div>
            ${attachmentsHtml}
            ${historyHtml}
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 3rem 0 1rem 0;">
            <div class="comment-thread">
                <h3 style="margin-bottom: 1rem;"><i class="ph ph-chats"></i> Comments (${comments.length})</h3>
                <form id="add-comment-form" style="display: flex; gap: 1rem; margin-bottom: 2rem;"><input type="text" id="new-comment-text" class="form-input" placeholder="Write a comment..." required><button type="submit" class="btn" style="width: auto;">Post</button></form>
                ${commentsHtml}
            </div>
        </div>
    `;
}

function BlogEditorView(projectId, blogId = 'new') {
    const project = window.CURRENT_PROJECTS.find(p => p.id === projectId);
    if (project && currentUserRole !== 'admin' && !project.members.includes(currentUsername)) return `<div style="text-align: center; margin-top: 5rem; color: #ef4444;"><h2><i class="ph ph-lock-key"></i> Access Denied</h2></div>`;
    const isEditing = blogId !== 'new'; const blog = isEditing ? window.CURRENT_BLOGS.find(b => b.id === blogId) : null;
    const defaultDate = blog ? blog.date : new Date().toISOString().split('T')[0];
    
    window.tempUploadedFiles = blog && blog.attachments ? [...blog.attachments] : [];
    const existingAttachmentsHtml = window.tempUploadedFiles.map((f, i) => `<span class="tag" style="background: #e0f2fe; color: #0284c7; margin-top: 0.5rem; display: inline-flex; align-items: center; gap: 4px;"><i class="ph ph-file"></i> ${f.name} <i class="ph ph-x" style="cursor: pointer; color: #ef4444;" onclick="removeAttachment(${i})"></i></span> `).join('');

    return `
        <div class="card" style="max-width: 800px; margin: 0 auto;"><button class="btn" style="background: transparent; color: var(--text-muted); width: auto; padding: 0; margin-bottom: 1rem;" onclick="window.history.back()"><i class="ph ph-arrow-left"></i> Cancel</button><h2><i class="ph ph-pencil-simple"></i> ${isEditing ? 'Edit Log' : 'Write a Log'}</h2>
            <form id="save-log-form">
                <div style="display: flex; gap: 1rem; margin-bottom: 1.25rem;"><div style="flex: 2;"><input type="text" id="log-title" class="form-input" placeholder="Log Title..." value="${blog ? blog.title : ''}" required></div><div style="flex: 1; max-width: 200px;"><input type="date" id="log-date" class="form-input" value="${defaultDate}" required></div></div>
                <div class="form-group" style="position: relative;"><div id="log-content" class="form-input editor-content" contenteditable="true" data-placeholder="Write your log content here...">${blog ? blog.content : ''}</div></div>
                
                <div class="form-group">
                    <button type="button" class="btn" style="width: auto; background: var(--surface-color); color: var(--text-main);" onclick="document.getElementById('log-attachment').click()"><i class="ph ph-paperclip"></i> Attach Files</button>
                    <input type="file" id="log-attachment" multiple style="display: none;" onchange="handleAttachmentUpload(event)">
                    <div id="attachment-preview" style="margin-top: 0.5rem;">${existingAttachmentsHtml}</div>
                </div>

                <div class="form-group" style="display: flex; gap: 2rem; flex-wrap: wrap;"><div style="flex: 1; min-width: 250px;"><label><i class="ph ph-tags"></i> Select Tags</label><div class="scrollable-checklist">${project ? project.allowedTags.map(tag => `<label class="checklist-item"><input type="checkbox" class="tag-checkbox" value="${tag}" ${blog && blog.tags.includes(tag) ? 'checked' : ''}> ${tag}</label>`).join('') : ''}</div></div></div>
                
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2rem;">
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem;"><input type="checkbox" id="log-pinned"> Pin to All Users</label>
                    <button type="submit" class="btn" style="width: auto;">${isEditing ? 'Save Changes' : 'Publish Log'}</button>
                </div>
            </form>
        </div>
    `;
}

function ProjectSettingsView(projectId, dbUsers = []) {
    if (currentUserRole !== 'admin') return `<div style="text-align: center; margin-top: 5rem; color: #ef4444;"><h2><i class="ph ph-lock-key"></i> Access Denied</h2></div>`;
    const project = window.CURRENT_PROJECTS.find(p => p.id === projectId);
    if (!project) return `<div style="text-align: center; margin-top: 5rem;"><h2>Project not found</h2></div>`;
    const standardUsers = dbUsers.filter(u => u.role !== 'admin');
    const membersHtml = standardUsers.map(u => `<label style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem; cursor: pointer;"><input type="checkbox" class="edit-proj-member" value="${u.username}" ${project.members.includes(u.username) ? 'checked' : ''}><i class="ph ph-user"></i> ${u.username}</label>`).join('');

    return `
        <div class="card" style="max-width: 600px; margin: 0 auto;"><button class="btn" style="background: transparent; color: var(--text-muted); width: auto; padding: 0; margin-bottom: 1rem;" onclick="window.location.hash='#/project/${projectId}'"><i class="ph ph-arrow-left"></i> Back to Logs</button><h2><i class="ph ph-gear"></i> Project Settings</h2><form id="edit-project-form" style="margin-top: 1.5rem;"><div class="form-group"><label>Project Name</label><input type="text" id="edit-proj-name" class="form-input" value="${project.name}" required></div><div class="form-group"><label>Description</label><textarea id="edit-proj-desc" class="form-input" rows="3" required>${project.description}</textarea></div><div class="form-group"><label>Allowed Tags</label><input type="text" id="edit-proj-tags" class="form-input" value="${project.allowedTags.join(', ')}"></div><div class="form-group"><label>Manage Access</label><div class="scrollable-checklist" style="background: #ffffff;">${membersHtml || '<p style="color: var(--text-muted); font-size: 0.85rem;">No standard users exist yet.</p>'}</div></div><button type="submit" class="btn" style="margin-top: 1rem;">Save Changes</button></form><hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 2rem 0;"><div style="background: #fee2e2; border: 1px solid #f87171; padding: 1.5rem; border-radius: 8px;"><h3 style="color: #b91c1c; margin-top: 0; margin-bottom: 0.5rem;"><i class="ph ph-warning"></i> Danger Zone</h3><p style="font-size: 0.85rem; color: #991b1b; margin-bottom: 1rem;">Once you delete a project, there is no going back. Please be certain.</p><button type="button" class="btn" style="background: #ef4444; color: white;" onclick="handleDeleteProject('${project.id}', '${project.name}')">Delete Project</button></div></div>
    `;
}

function UserManagementView(dbUsers = []) {
    if (currentUserRole !== 'admin') return `<h2>Access Denied</h2>`;
    const userRows = dbUsers.map(u => `<div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; border-bottom: 1px solid #e2e8f0;"><div style="display: flex; align-items: center; gap: 0.75rem;"><img src="${getUserIcon(u.username)}" data-user="${u.username}" style="width: 32px; height: 32px; border-radius: 50%; background: #e2e8f0; object-fit: cover;"><div><strong>${u.username}</strong><div style="font-size: 0.75rem; color: var(--text-muted);">${u.role === 'admin' ? 'System Administrator' : 'Team Member'}</div></div></div>${u.role !== 'admin' ? `<button class="btn" style="width: auto; background: #fee2e2; color: #ef4444; padding: 0.25rem 0.75rem; font-size: 0.8rem;" onclick="handleDeleteUser('${u.username}')">Remove</button>` : ''}</div>`).join('');
    return `<div style="max-width: 800px; margin: 0 auto; display: grid; grid-template-columns: 1fr 300px; gap: 2rem; padding: 0 2rem;"><div><h2 style="margin-bottom: 1.5rem;"><i class="ph ph-users"></i> Team Members</h2><div class="card" style="padding: 0;">${userRows}</div></div><div><h2 style="margin-bottom: 1.5rem;">Add New User</h2><div class="card"><form id="create-user-form"><div class="form-group"><label>Username</label><input type="text" id="new-user-name" class="form-input" placeholder="e.g. jsmith" required></div><div class="form-group"><label>Temporary Password</label><input type="text" id="new-user-pass" class="form-input" value="welcome123" required></div><button type="submit" class="btn">Create Account</button></form><div id="user-msg" style="margin-top: 1rem; font-size: 0.85rem;"></div></div></div></div>`;
}

function ProfileView() {
    window.tempSelectedIcon = currentUserIcon; const isCustom = !PREDEFINED_ICONS.includes(currentUserIcon);
    return `<div class="card" style="max-width: 500px; margin: 0 auto; margin-top: 2rem;"><h2><i class="ph ph-user-circle"></i> Edit Profile</h2><form id="edit-profile-form"><div class="form-group" style="text-align: center; margin-bottom: 2rem;"><label style="text-align: left;">Choose Profile Icon</label><div style="display: flex; gap: 1rem; flex-wrap: wrap; justify-content: center; margin-top: 1rem; align-items: center;">${PREDEFINED_ICONS.map(url => `<img src="${url}" class="avatar-option" onclick="selectAvatar('${url}')" data-url="${url}" style="width: 55px; height: 55px; border-radius: 50%; cursor: pointer; border: 3px solid ${url === currentUserIcon && !isCustom ? 'var(--primary)' : 'transparent'}; background: #e2e8f0; padding: 4px; transition: border-color 0.2s;">`).join('')}<img id="custom-avatar-preview" src="${isCustom ? currentUserIcon : ''}" style="width: 55px; height: 55px; border-radius: 50%; cursor: pointer; border: 3px solid ${isCustom ? 'var(--primary)' : 'transparent'}; background: #e2e8f0; padding: 4px; display: ${isCustom ? 'inline-block' : 'none'}; object-fit: cover;" onclick="selectAvatar(this.src)" title="Your Custom Avatar"></div><div style="margin-top: 1.5rem;"><button type="button" class="btn" style="background: #edf2f7; color: var(--text-main); width: auto; font-size: 0.9rem;" onclick="document.getElementById('avatar-upload').click()"><i class="ph ph-upload-simple"></i> Upload Custom Image</button><input type="file" id="avatar-upload" accept="image/*" style="display: none;" onchange="handleAvatarUpload(event)"></div></div><div class="form-group"><label>Username</label><input type="text" id="profile-username" class="form-input" value="${currentUsername}" required></div><hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 2rem 0;"><p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">Leave passwords blank if you don't want to change them.</p><div class="form-group"><label>Current Password</label><input type="password" id="profile-current-password" class="form-input" placeholder="Enter current password..."></div><div class="form-group"><label>New Password</label><input type="password" id="profile-password" class="form-input" placeholder="Enter new password..."></div><div class="form-group"><label>Confirm New Password</label><input type="password" id="profile-confirm-password" class="form-input" placeholder="Confirm new password..."></div><div id="profile-message" style="margin-bottom: 1rem; font-size: 0.9rem; font-weight: 500;"></div><button type="submit" class="btn">Save Changes</button></form></div>`;
}

function getBlogCardsHtml(projectId) {
    const project = window.CURRENT_PROJECTS.find(p => p.id === projectId); if (!project) return '';
    let blogs = window.CURRENT_BLOGS.filter(b => b.projectId === projectId);
    
    if (window.galleryState.searchQuery) { const query = window.galleryState.searchQuery; blogs = blogs.filter(blog => blog.title.toLowerCase().includes(query) || blog.content.toLowerCase().includes(query)); }
    if (window.galleryState.filters.length > 0) blogs = blogs.filter(blog => window.galleryState.filters.some(tag => blog.tags.includes(tag)));
    
    // SORTING: We only need to check Personal Pins now!
    blogs = blogs.sort((a, b) => { 
        const aPinned = a.pinnedBy && a.pinnedBy.includes(currentUsername);
        const bPinned = b.pinnedBy && b.pinnedBy.includes(currentUsername);
        if (aPinned !== bPinned) return aPinned ? -1 : 1; 
        const dateA = new Date(a.createdAt || a.date).getTime() || 0; 
        const dateB = new Date(b.createdAt || b.date).getTime() || 0; 
        return window.galleryState.sortOrder === 'desc' ? dateB - dateA : dateA - dateB; 
    });

    return blogs.map(blog => {
        // Every pin is just a personal pin now
        const isPersonallyPinned = blog.pinnedBy && blog.pinnedBy.includes(currentUsername);
        
        const pinIconHtml = `<button class="pin-btn ${isPersonallyPinned ? 'pinned' : ''}" title="${isPersonallyPinned ? 'Unpin from your account' : 'Pin to your account'}" onclick="togglePin(event, '${blog.id}', '${projectId}')"><i class="${isPersonallyPinned ? 'ph-fill' : 'ph'} ph-push-pin" style="font-size: 1.25rem;"></i></button>`;

        return `
        <div class="card" onclick="window.location.hash='#/project/${projectId}/blog/${blog.id}'">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <h3 style="margin-top: 0; margin-bottom: 0.5rem; padding-right: 1rem; font-size: 1.1rem;">${blog.title}</h3>
                ${pinIconHtml}
            </div>
            <p>${blog.excerpt}</p><div style="margin-top: 0.5rem;">${blog.tags.map(t => `<span class="tag ${getTagColorClass(t, project.allowedTags)}">${t}</span>`).join(' ')}</div>
            <div class="blog-meta"><span style="display: flex; align-items: center; gap: 0.5rem;"><img src="${getUserIcon(blog.author)}" data-user="${blog.author}" style="width: 20px; height: 20px; border-radius: 50%; background: #e2e8f0; object-fit: cover;"> ${blog.author}</span><div style="display: flex; gap: 1rem;"><span style="display: flex; align-items: center; gap: 0.25rem;"><i class="ph ph-chat-circle"></i> ${getCommentCount(blog.id)}</span><span style="display: flex; align-items: center; gap: 0.25rem;"><i class="ph ph-calendar-blank"></i> ${formatFullDate(blog.createdAt || blog.date).split('at')[0]}</span></div></div>
        </div>
        `;
    }).join('') || '<p style="padding: 0 2rem; color: var(--text-muted); grid-column: 1 / -1;">No logs found.</p>';
}

// --- Main Router ---
async function router() {
    const hash = window.location.hash.slice(1) || '/';
    const pathSegments = hash.split('/').filter(Boolean);

    appRoot.innerHTML = ''; 
    if (!authToken && pathSegments[0] !== 'login') { window.location.hash = '#/login'; return; }
    if (pathSegments[0] === 'login') { topNav.style.display = 'none'; appRoot.innerHTML = LoginView(); document.getElementById('login-form').addEventListener('submit', handleLogin); return; } 
    
    topNav.style.display = 'flex';
    document.querySelector('.nav-links').innerHTML = `<a href="#/"><i class="ph ph-squares-four"></i> Projects</a>${currentUserRole === 'admin' ? `<a href="#/users"><i class="ph ph-users"></i> Users</a>` : ''}<a href="#/profile"><i class="ph ph-user-circle"></i> Profile</a><a href="#" id="logout-btn" onclick="handleLogout()" style="display: flex; align-items: center; gap: 0.5rem;"><img src="${getUserIcon(currentUsername)}" data-user="${currentUsername}" style="width: 20px; height: 20px; border-radius: 50%; background: #e2e8f0; object-fit: cover;"> Logout (${currentUsername})</a>`;
    try {
        if (authToken) window.CURRENT_PROJECTS = await apiFetch('/projects');

        if ((pathSegments[0] === 'project' || pathSegments[0] === 'edit' || pathSegments[0] === 'settings') && pathSegments[1] && pathSegments[1] !== 'new') {
            window.CURRENT_BLOGS = await apiFetch(`/projects/${pathSegments[1]}/blogs`);
            window.CURRENT_COMMENTS = await apiFetch(`/projects/${pathSegments[1]}/comments`); // FETCH COMMENTS FROM DB
        } else {
            window.CURRENT_BLOGS = [];
            window.CURRENT_COMMENTS = [];
        }

        if (pathSegments.length === 0) appRoot.innerHTML = ProjectGalleryView();
        else if (pathSegments[0] === 'project' && pathSegments[1] === 'new') { const users = await apiFetch('/users'); appRoot.innerHTML = ProjectCreateView(users); document.getElementById('create-project-form').addEventListener('submit', handleCreateProject); }
        else if (pathSegments[0] === 'project' && pathSegments[2] === 'blog' && pathSegments[3]) {
            appRoot.innerHTML = BlogDetailView(pathSegments[1], pathSegments[3]);
            const commentForm = document.getElementById('add-comment-form');
            if(commentForm) commentForm.addEventListener('submit', (e) => handleAddComment(e, pathSegments[1], pathSegments[3]));
        }
        else if (pathSegments[0] === 'project' && pathSegments[1]) { const users = await apiFetch('/users'); appRoot.innerHTML = BlogGalleryView(pathSegments[1], users); }
        else if (pathSegments[0] === 'settings' && pathSegments[1]) { const users = await apiFetch('/users'); appRoot.innerHTML = ProjectSettingsView(pathSegments[1], users); const editForm = document.getElementById('edit-project-form'); if (editForm) editForm.addEventListener('submit', (e) => handleEditProject(e, pathSegments[1])); }
        else if (pathSegments[0] === 'edit' && pathSegments[1]) { const blogId = pathSegments[2] || 'new'; appRoot.innerHTML = BlogEditorView(pathSegments[1], blogId); initializeRichTextEditor(); document.getElementById('save-log-form').addEventListener('submit', (e) => handleSaveLog(e, pathSegments[1], blogId)); }
        else if (pathSegments[0] === 'profile') { appRoot.innerHTML = ProfileView(); document.getElementById('edit-profile-form').addEventListener('submit', handleUpdateProfile); }
        else if (pathSegments[0] === 'users') { const users = await apiFetch('/users'); appRoot.innerHTML = UserManagementView(users); const userForm = document.getElementById('create-user-form'); if (userForm) userForm.addEventListener('submit', handleCreateUser); }
        else appRoot.innerHTML = `<div style="text-align: center; margin-top: 5rem;"><h2>404 - Not Found</h2></div>`;
    } catch(err) { appRoot.innerHTML = `<div style="text-align: center; margin-top: 5rem; color: #ef4444;"><h2>Error</h2><p>${err.message}</p></div>`; }
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);

// NEW: Manage, Render, and Remove Attachments
window.renderAttachmentPreview = function() {
    const preview = document.getElementById('attachment-preview');
    if (preview) {
        preview.innerHTML = window.tempUploadedFiles.map((f, i) => `
            <span class="tag" style="background: #e0f2fe; color: #0284c7; margin-top: 0.5rem; display: inline-flex; align-items: center; gap: 4px;">
                <i class="ph ph-file"></i> ${f.name} 
                <i class="ph ph-x" style="cursor: pointer; color: #ef4444;" onclick="removeAttachment(${i})"></i>
            </span> `
        ).join('');
    }
};

window.removeAttachment = function(index) {
    window.tempUploadedFiles.splice(index, 1); // Remove it from the array
    window.renderAttachmentPreview(); // Re-render the UI
};

window.handleAttachmentUpload = function(event) {
    const files = event.target.files;
    if (!window.tempUploadedFiles) window.tempUploadedFiles = [];
    
    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            window.tempUploadedFiles.push({ name: file.name, data: e.target.result, type: file.type });
            window.renderAttachmentPreview();
        };
        reader.readAsDataURL(file);
    });
    
    // Clear the input so you can upload the exact same file again if you accidentally deleted it
    event.target.value = ''; 
};

// --- Utilities ---
const getTagColorClass = (tagName, projectTags = []) => { let index = projectTags.indexOf(tagName); if (index === -1) index = 0; return `tag-c${index % 6}`; };
function insertImageToEditor(file) { if (!file || !file.type.startsWith('image/')) return; const reader = new FileReader(); reader.onload = (event) => document.execCommand('insertImage', false, event.target.result); reader.readAsDataURL(file); }
function initializeRichTextEditor() { const editor = document.getElementById('log-content'); if (!editor) return; editor.addEventListener('paste', (e) => { const items = (e.clipboardData || e.originalEvent.clipboardData).items; for (let index in items) { const item = items[index]; if (item.kind === 'file' && item.type.startsWith('image/')) { e.preventDefault(); insertImageToEditor(item.getAsFile()); } } }); }
const formatFullDate = (dateStr) => { if (!dateStr) return "Unknown"; return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }); };
window.selectAvatar = function(url) { window.tempSelectedIcon = url; document.querySelectorAll('.avatar-option').forEach(img => img.style.borderColor = img.dataset.url === url ? 'var(--primary)' : 'transparent'); const customPreview = document.getElementById('custom-avatar-preview'); if (customPreview) customPreview.style.borderColor = 'transparent'; };