/**
 * PID-Builder File Organization Tool - Main Application
 */

// ============================================================
// STATE
// ============================================================
const state = {
  user: null,
  currentProject: null,
  currentFolder: null,
  currentLabelFilter: null,
  folders: [],
  files: [],
  labels: [],
  templates: [],
  ctops: [],
};

// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  checkAuth();
});

function initEventListeners() {
  // Auth
  document.getElementById('login-btn').addEventListener('click', handleLogin);
  document.getElementById('register-btn').addEventListener('click', handleRegister);
  document.getElementById('show-register').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.remove('hidden');
  });
  document.getElementById('show-login').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
  });
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  // Enter key on auth inputs
  document.getElementById('login-password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('register-password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleRegister();
  });

  // Project
  document.getElementById('project-selector').addEventListener('change', handleProjectChange);
  document.getElementById('new-project-btn').addEventListener('click', () => showModal('modal-project'));
  document.getElementById('create-project-btn').addEventListener('click', handleCreateProject);

  // Navigation
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Files
  document.getElementById('upload-btn').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });
  document.getElementById('file-input').addEventListener('change', handleFileUpload);

  // Folders
  document.getElementById('new-folder-btn').addEventListener('click', () => showModal('modal-folder'));
  document.getElementById('create-folder-btn').addEventListener('click', handleCreateFolder);

  // Labels
  document.getElementById('new-label-btn').addEventListener('click', () => showModal('modal-label'));
  document.getElementById('create-label-btn').addEventListener('click', handleCreateLabel);

  // Templates
  document.getElementById('upload-template-btn').addEventListener('click', () => {
    document.getElementById('template-input').click();
  });
  document.getElementById('template-input').addEventListener('change', handleTemplateUpload);
  document.getElementById('fill-template-btn').addEventListener('click', handleFillTemplate);

  // CTOPs
  document.getElementById('new-ctop-btn').addEventListener('click', () => showModal('modal-ctop'));
  document.getElementById('create-ctop-btn').addEventListener('click', handleCreateCtop);
  document.getElementById('ctop-add-btn').addEventListener('click', handleAddCtopItem);
  document.getElementById('ctop-add-type').addEventListener('change', handleCtopTypeChange);

  // Search
  document.getElementById('search-btn').addEventListener('click', handleSearch);
  document.getElementById('global-search').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
  });

  // Modal close
  document.querySelectorAll('.modal-cancel, .modal-overlay').forEach(el => {
    el.addEventListener('click', (e) => {
      e.target.closest('.modal').classList.add('hidden');
    });
  });
}

// ============================================================
// AUTH
// ============================================================
async function checkAuth() {
  if (!API.token) {
    showScreen('auth-screen');
    return;
  }
  try {
    const data = await API.getMe();
    state.user = data.user;
    showScreen('app-screen');
    document.getElementById('user-name').textContent = state.user.name;
    loadProjects();
  } catch {
    API.setToken(null);
    showScreen('auth-screen');
  }
}

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) return showAuthError('Please fill in all fields');

  try {
    const data = await API.login(email, password);
    API.setToken(data.token);
    state.user = data.user;
    showScreen('app-screen');
    document.getElementById('user-name').textContent = state.user.name;
    loadProjects();
  } catch (err) {
    showAuthError(err.message);
  }
}

async function handleRegister() {
  const name = document.getElementById('register-name').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  if (!name || !email || !password) return showAuthError('Please fill in all fields');

  try {
    const data = await API.register(name, email, password);
    API.setToken(data.token);
    state.user = data.user;
    showScreen('app-screen');
    document.getElementById('user-name').textContent = state.user.name;
    loadProjects();
  } catch (err) {
    showAuthError(err.message);
  }
}

function handleLogout() {
  API.setToken(null);
  state.user = null;
  state.currentProject = null;
  showScreen('auth-screen');
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

// ============================================================
// PROJECTS
// ============================================================
async function loadProjects() {
  try {
    const data = await API.listProjects();
    const select = document.getElementById('project-selector');
    select.innerHTML = '<option value="">Select Project...</option>';
    data.projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      select.appendChild(opt);
    });

    // Auto-select if there's a saved project
    const saved = localStorage.getItem('currentProject');
    if (saved && data.projects.find(p => p.id === saved)) {
      select.value = saved;
      handleProjectChange();
    }
  } catch (err) {
    toast('Failed to load projects', 'error');
  }
}

async function handleProjectChange() {
  const id = document.getElementById('project-selector').value;
  if (!id) {
    state.currentProject = null;
    return;
  }

  state.currentProject = id;
  state.currentFolder = null;
  state.currentLabelFilter = null;
  localStorage.setItem('currentProject', id);

  // Load all data for the project
  await Promise.all([
    loadFolders(),
    loadLabels(),
    loadFiles(),
    loadTemplates(),
    loadCtops(),
  ]);
}

async function handleCreateProject() {
  const name = document.getElementById('project-name').value.trim();
  const desc = document.getElementById('project-desc').value.trim();
  if (!name) return toast('Project name is required', 'error');

  try {
    await API.createProject(name, desc);
    hideModal('modal-project');
    document.getElementById('project-name').value = '';
    document.getElementById('project-desc').value = '';
    toast('Project created', 'success');
    loadProjects();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ============================================================
// FOLDERS
// ============================================================
async function loadFolders() {
  if (!state.currentProject) return;
  try {
    const data = await API.listFolders(state.currentProject);
    state.folders = data.folders;
    renderFolderTree();
  } catch (err) {
    console.error('Load folders error:', err);
  }
}

function renderFolderTree() {
  const container = document.getElementById('folder-tree');
  container.innerHTML = '';

  // "All Files" option
  const allNode = createFolderNode({ id: null, name: 'All Files', file_count: '', subfolder_count: 0 });
  if (!state.currentFolder) allNode.classList.add('active');
  allNode.addEventListener('click', () => {
    state.currentFolder = null;
    document.querySelectorAll('.folder-node').forEach(n => n.classList.remove('active'));
    allNode.classList.add('active');
    document.getElementById('files-title').textContent = 'All Files';
    loadFiles();
  });
  container.appendChild(allNode);

  // Build tree from flat list
  const roots = state.folders.filter(f => !f.parent_id);
  roots.forEach(folder => {
    container.appendChild(buildFolderSubtree(folder));
  });
}

function buildFolderSubtree(folder) {
  const wrapper = document.createElement('div');

  const node = createFolderNode(folder);
  if (state.currentFolder === folder.id) node.classList.add('active');

  node.addEventListener('click', () => {
    state.currentFolder = folder.id;
    document.querySelectorAll('.folder-node').forEach(n => n.classList.remove('active'));
    node.classList.add('active');
    document.getElementById('files-title').textContent = folder.name;
    loadFiles();
  });

  wrapper.appendChild(node);

  const children = state.folders.filter(f => f.parent_id === folder.id);
  if (children.length > 0) {
    const childContainer = document.createElement('div');
    childContainer.className = 'folder-children';
    children.forEach(child => {
      childContainer.appendChild(buildFolderSubtree(child));
    });
    wrapper.appendChild(childContainer);
  }

  return wrapper;
}

function createFolderNode(folder) {
  const node = document.createElement('div');
  node.className = 'folder-node';
  node.dataset.id = folder.id;
  node.innerHTML = `
    <span class="folder-icon">${folder.id ? '\u{1F4C1}' : '\u{1F4C2}'}</span>
    <span>${folder.name}</span>
    ${folder.file_count !== '' ? `<span class="folder-count">${folder.file_count}</span>` : ''}
  `;
  return node;
}

async function handleCreateFolder() {
  const name = document.getElementById('folder-name').value.trim();
  const desc = document.getElementById('folder-desc').value.trim();
  if (!name) return toast('Folder name is required', 'error');
  if (!state.currentProject) return toast('Select a project first', 'error');

  try {
    await API.createFolder(state.currentProject, name, state.currentFolder, desc);
    hideModal('modal-folder');
    document.getElementById('folder-name').value = '';
    document.getElementById('folder-desc').value = '';
    toast('Folder created', 'success');
    loadFolders();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ============================================================
// FILES
// ============================================================
async function loadFiles() {
  if (!state.currentProject) return;
  try {
    const data = await API.listFiles(state.currentProject, state.currentFolder, state.currentLabelFilter);
    state.files = data.files;
    renderFiles();
  } catch (err) {
    console.error('Load files error:', err);
  }
}

function renderFiles() {
  const container = document.getElementById('files-list');
  const empty = document.getElementById('files-empty');

  if (state.files.length === 0) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  container.innerHTML = state.files.map(file => `
    <div class="file-card" data-id="${file.id}">
      <div class="file-card-header">
        <span class="file-icon">${getFileIcon(file.mime_type)}</span>
        <div class="file-info">
          <div class="file-name" title="${escapeHtml(file.original_name)}">${escapeHtml(file.original_name)}</div>
          <div class="file-meta">
            ${formatFileSize(file.file_size)} &middot; ${formatDate(file.created_at)}
            ${file.folder_name ? ` &middot; ${escapeHtml(file.folder_name)}` : ''}
          </div>
        </div>
      </div>
      <div>
        ${file.ai_analyzed
          ? `<span class="file-ai-badge">AI Analyzed</span>`
          : `<span class="file-ai-badge file-ai-pending">AI Pending</span>`
        }
      </div>
      <div class="file-labels">
        ${(file.labels || []).map(l => `
          <span class="file-label" style="background:${l.color}">${escapeHtml(l.name)}</span>
        `).join('')}
      </div>
    </div>
  `).join('');

  // Click handlers
  container.querySelectorAll('.file-card').forEach(card => {
    card.addEventListener('click', () => showFileDetail(card.dataset.id));
  });
}

async function handleFileUpload(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  if (!state.currentProject) return toast('Select a project first', 'error');

  try {
    toast('Uploading files...', 'info');
    await API.uploadFiles(state.currentProject, files, state.currentFolder);
    toast(`${files.length} file(s) uploaded. AI analysis in progress.`, 'success');
    loadFiles();
    loadFolders();
  } catch (err) {
    toast(err.message, 'error');
  }

  e.target.value = '';
}

async function showFileDetail(fileId) {
  try {
    const data = await API.getFile(fileId);
    const file = data.file;

    document.getElementById('file-detail-title').textContent = file.original_name;
    document.getElementById('file-detail-body').innerHTML = `
      <div class="file-detail-row">
        <span class="file-detail-label">File Name</span>
        <span class="file-detail-value">${escapeHtml(file.original_name)}</span>
      </div>
      <div class="file-detail-row">
        <span class="file-detail-label">Size</span>
        <span class="file-detail-value">${formatFileSize(file.file_size)}</span>
      </div>
      <div class="file-detail-row">
        <span class="file-detail-label">Type</span>
        <span class="file-detail-value">${file.mime_type || 'Unknown'}</span>
      </div>
      <div class="file-detail-row">
        <span class="file-detail-label">Uploaded By</span>
        <span class="file-detail-value">${escapeHtml(file.uploaded_by_name)}</span>
      </div>
      <div class="file-detail-row">
        <span class="file-detail-label">Uploaded</span>
        <span class="file-detail-value">${formatDate(file.created_at)}</span>
      </div>
      <div class="file-detail-row">
        <span class="file-detail-label">Folder</span>
        <span class="file-detail-value">${file.folder_path || 'Unassigned'}</span>
      </div>
      <div class="file-detail-row">
        <span class="file-detail-label">AI Analysis</span>
        <span class="file-detail-value">
          ${file.ai_analyzed
            ? `<span class="file-ai-badge">Analyzed (${Math.round((file.ai_confidence || 0) * 100)}% confidence)</span>`
            : '<span class="file-ai-badge file-ai-pending">Pending</span>'
          }
        </span>
      </div>
      ${file.ai_summary ? `
        <div class="file-detail-row">
          <span class="file-detail-label">AI Summary</span>
          <span class="file-detail-value">
            <div class="ai-summary">${escapeHtml(file.ai_summary)}</div>
          </span>
        </div>
      ` : ''}
      <div class="file-detail-row">
        <span class="file-detail-label">Labels</span>
        <span class="file-detail-value">
          <div class="file-labels">
            ${(file.labels || []).map(l => `
              <span class="file-label" style="background:${l.color}">
                ${escapeHtml(l.name)}
                ${l.assigned_by === 'ai' ? ' (AI)' : ''}
              </span>
            `).join('')}
          </div>
        </span>
      </div>
      <div class="file-detail-actions">
        <button class="btn btn-primary btn-sm" onclick="downloadFile('${file.id}')">Download</button>
        <button class="btn btn-sm" onclick="reanalyzeFile('${file.id}')">Re-analyze with AI</button>
        <button class="btn btn-danger btn-sm" onclick="deleteFile('${file.id}')">Delete</button>
      </div>
    `;

    showModal('modal-file-detail');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function downloadFile(fileId) {
  try {
    const data = await API.getFileDownloadUrl(fileId);
    window.open(data.url, '_blank');
  } catch (err) {
    toast('Download failed', 'error');
  }
}

async function reanalyzeFile(fileId) {
  try {
    await API.reanalyzeFile(fileId);
    toast('Re-analysis started', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteFile(fileId) {
  if (!confirm('Delete this file permanently?')) return;
  try {
    await API.deleteFile(fileId);
    hideModal('modal-file-detail');
    toast('File deleted', 'success');
    loadFiles();
    loadFolders();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ============================================================
// LABELS
// ============================================================
async function loadLabels() {
  if (!state.currentProject) return;
  try {
    const data = await API.listLabels(state.currentProject);
    state.labels = data.labels;
    renderLabelFilters();
    renderLabelsView();
  } catch (err) {
    console.error('Load labels error:', err);
  }
}

function renderLabelFilters() {
  const container = document.getElementById('label-filters');
  container.innerHTML = state.labels.map(label => `
    <span class="label-chip ${state.currentLabelFilter === label.id ? 'active' : ''}"
          data-id="${label.id}"
          style="background: ${label.color}22; color: ${label.color}">
      ${escapeHtml(label.name)}
    </span>
  `).join('');

  container.querySelectorAll('.label-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const id = chip.dataset.id;
      if (state.currentLabelFilter === id) {
        state.currentLabelFilter = null;
        chip.classList.remove('active');
      } else {
        state.currentLabelFilter = id;
        container.querySelectorAll('.label-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      }
      loadFiles();
    });
  });
}

function renderLabelsView() {
  const container = document.getElementById('labels-list');
  container.innerHTML = state.labels.map(label => `
    <div class="label-card">
      <div class="label-color-dot" style="background: ${label.color}"></div>
      <div class="label-info">
        <div class="label-info-name">${escapeHtml(label.name)}</div>
        <div class="label-info-count">${label.usage_count || 0} files</div>
      </div>
      <span class="label-type">${label.is_predefined ? 'System' : 'Custom'}</span>
      ${!label.is_predefined ? `<button class="btn btn-xs btn-danger" onclick="deleteLabel('${label.id}')">Del</button>` : ''}
    </div>
  `).join('');
}

async function handleCreateLabel() {
  const name = document.getElementById('label-name').value.trim();
  const color = document.getElementById('label-color').value;
  if (!name) return toast('Label name is required', 'error');
  if (!state.currentProject) return toast('Select a project first', 'error');

  try {
    await API.createLabel(name, color, state.currentProject);
    hideModal('modal-label');
    document.getElementById('label-name').value = '';
    toast('Label created', 'success');
    loadLabels();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteLabel(id) {
  if (!confirm('Delete this custom label?')) return;
  try {
    await API.deleteLabel(id);
    toast('Label deleted', 'success');
    loadLabels();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ============================================================
// TEMPLATES
// ============================================================
async function loadTemplates() {
  if (!state.currentProject) return;
  try {
    const data = await API.listTemplates(state.currentProject);
    state.templates = data.templates;
    renderTemplates();
  } catch (err) {
    console.error('Load templates error:', err);
  }
}

function renderTemplates() {
  const container = document.getElementById('templates-list');
  const empty = document.getElementById('templates-empty');

  if (state.templates.length === 0) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  container.innerHTML = state.templates.map(tmpl => `
    <div class="template-card">
      <div class="template-name">${escapeHtml(tmpl.name)}</div>
      ${tmpl.description ? `<div class="template-desc">${escapeHtml(tmpl.description)}</div>` : ''}
      <div class="template-meta">
        ${tmpl.placeholder_count} placeholder(s) &middot; ${tmpl.fill_count} filled &middot; ${formatDate(tmpl.created_at)}
      </div>
      <div class="template-actions">
        <button class="btn btn-primary btn-sm" onclick="openFillTemplate('${tmpl.id}')">Fill Template</button>
        <button class="btn btn-sm" onclick="downloadTemplate('${tmpl.id}')">Download</button>
        <button class="btn btn-danger btn-sm" onclick="deleteTemplate('${tmpl.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

async function handleTemplateUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!state.currentProject) return toast('Select a project first', 'error');

  const name = prompt('Template name:', file.name.replace(/\.docx$/i, ''));
  if (!name) return;

  try {
    toast('Uploading template...', 'info');
    const data = await API.uploadTemplate(state.currentProject, file, name, '');
    const phCount = data.template.placeholders ? data.template.placeholders.length : 0;
    toast(`Template uploaded. ${phCount} placeholder(s) detected.`, 'success');
    loadTemplates();
  } catch (err) {
    toast(err.message, 'error');
  }

  e.target.value = '';
}

async function openFillTemplate(templateId) {
  try {
    const data = await API.getTemplate(templateId);
    const tmpl = data.template;

    document.getElementById('fill-template-title').textContent = `Fill: ${tmpl.name}`;

    const fieldsContainer = document.getElementById('fill-template-fields');
    fieldsContainer.innerHTML = '';
    fieldsContainer.dataset.templateId = templateId;

    if (!tmpl.placeholders || tmpl.placeholders.length === 0) {
      fieldsContainer.innerHTML = '<p>No placeholders found in this template.</p>';
    } else {
      tmpl.placeholders.forEach(ph => {
        const div = document.createElement('div');
        div.className = 'template-field';
        div.innerHTML = `
          <label>${escapeHtml(ph.display_label || ph.placeholder_name)}${ph.is_required ? ' *' : ''}</label>
          <input type="${ph.field_type === 'date' ? 'date' : 'text'}"
                 data-placeholder="${ph.placeholder_name}"
                 value="${escapeHtml(ph.default_value || '')}"
                 placeholder="Enter ${escapeHtml(ph.display_label || ph.placeholder_name)}">
        `;
        fieldsContainer.appendChild(div);
      });
    }

    showModal('modal-fill-template');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function handleFillTemplate() {
  const fieldsContainer = document.getElementById('fill-template-fields');
  const templateId = fieldsContainer.dataset.templateId;
  const inputs = fieldsContainer.querySelectorAll('input[data-placeholder]');

  const values = {};
  inputs.forEach(input => {
    values[input.dataset.placeholder] = input.value;
  });

  const name = prompt('Name for the generated document:');
  if (!name) return;

  try {
    toast('Generating document...', 'info');
    const data = await API.fillTemplate(templateId, values, name, state.currentProject);

    hideModal('modal-fill-template');
    toast('Document generated!', 'success');

    if (data.download_url) {
      window.open(data.download_url, '_blank');
    }

    loadTemplates();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function downloadTemplate(templateId) {
  try {
    const data = await API.getTemplateDownloadUrl(templateId);
    window.open(data.url, '_blank');
  } catch (err) {
    toast('Download failed', 'error');
  }
}

async function deleteTemplate(id) {
  if (!confirm('Delete this template?')) return;
  try {
    await API.deleteTemplate(id);
    toast('Template deleted', 'success');
    loadTemplates();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ============================================================
// CTOPs
// ============================================================
async function loadCtops() {
  if (!state.currentProject) return;
  try {
    const data = await API.listCtops(state.currentProject);
    state.ctops = data.ctops;
    renderCtops();
  } catch (err) {
    console.error('Load CTOPs error:', err);
  }
}

function renderCtops() {
  const container = document.getElementById('ctops-list');
  const empty = document.getElementById('ctops-empty');

  if (state.ctops.length === 0) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  container.innerHTML = state.ctops.map(ctop => `
    <div class="ctop-card" data-id="${ctop.id}">
      <div class="ctop-name">${escapeHtml(ctop.name)}</div>
      ${ctop.description ? `<div class="ctop-desc">${escapeHtml(ctop.description)}</div>` : ''}
      <div class="ctop-meta">
        <span class="ctop-status ${ctop.status}">${ctop.status.replace('_', ' ')}</span>
        <span>${ctop.item_count} item(s)</span>
        <span>${formatDate(ctop.created_at)}</span>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.ctop-card').forEach(card => {
    card.addEventListener('click', () => showCtopDetail(card.dataset.id));
  });
}

async function handleCreateCtop() {
  const name = document.getElementById('ctop-name').value.trim();
  const desc = document.getElementById('ctop-desc').value.trim();
  if (!name) return toast('CTOP name is required', 'error');
  if (!state.currentProject) return toast('Select a project first', 'error');

  try {
    await API.createCtop(state.currentProject, name, desc);
    hideModal('modal-ctop');
    document.getElementById('ctop-name').value = '';
    document.getElementById('ctop-desc').value = '';
    toast('CTOP created', 'success');
    loadCtops();
  } catch (err) {
    toast(err.message, 'error');
  }
}

let currentCtopId = null;

async function showCtopDetail(ctopId) {
  try {
    currentCtopId = ctopId;
    const data = await API.getCtop(ctopId);
    const ctop = data.ctop;

    document.getElementById('ctop-detail-title').textContent = ctop.name;
    document.getElementById('ctop-detail-body').innerHTML = `
      <p style="color: var(--gray-500); margin-bottom: 12px;">
        ${ctop.description || 'No description'}
        &middot; Status: <span class="ctop-status ${ctop.status}">${ctop.status.replace('_', ' ')}</span>
      </p>
      <ul class="ctop-item-list">
        ${(ctop.items || []).map(item => `
          <li class="ctop-item-row">
            <span class="ctop-item-icon">${getCtopItemIcon(item.item_type)}</span>
            <span class="ctop-item-name">${escapeHtml(item.file_name || item.template_name || item.filled_template_name || 'Unknown')}</span>
            <span class="ctop-item-type">${item.item_type}</span>
            <button class="btn btn-xs btn-danger" onclick="removeCtopItem('${ctopId}', '${item.id}')">Remove</button>
          </li>
        `).join('') || '<li style="color: var(--gray-400); padding: 12px;">No items yet. Add files or templates below.</li>'}
      </ul>
    `;

    // Populate add-item dropdowns
    handleCtopTypeChange();

    showModal('modal-ctop-detail');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function handleCtopTypeChange() {
  const type = document.getElementById('ctop-add-type').value;
  const itemSelect = document.getElementById('ctop-add-item');
  itemSelect.innerHTML = '';

  if (type === 'file') {
    state.files.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.original_name;
      itemSelect.appendChild(opt);
    });
  } else if (type === 'template') {
    state.templates.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      itemSelect.appendChild(opt);
    });
  }
}

async function handleAddCtopItem() {
  if (!currentCtopId) return;
  const type = document.getElementById('ctop-add-type').value;
  const itemId = document.getElementById('ctop-add-item').value;
  if (!itemId) return toast('Select an item to add', 'error');

  try {
    await API.addCtopItem(currentCtopId, type, itemId);
    toast('Item added to CTOP', 'success');
    showCtopDetail(currentCtopId);
    loadCtops();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function removeCtopItem(ctopId, itemId) {
  try {
    await API.removeCtopItem(ctopId, itemId);
    toast('Item removed', 'success');
    showCtopDetail(ctopId);
    loadCtops();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ============================================================
// SEARCH
// ============================================================
async function handleSearch() {
  const q = document.getElementById('global-search').value.trim();
  if (!q) return;
  if (!state.currentProject) return toast('Select a project first', 'error');

  try {
    const data = await API.search(state.currentProject, q);
    switchView('search');

    document.getElementById('search-title').textContent = `Search: "${q}"`;
    const container = document.getElementById('search-results');

    let html = '';

    if (data.files.length > 0) {
      html += `<div class="search-section"><h3>Files (${data.files.length})</h3>`;
      html += '<div class="files-grid">';
      data.files.forEach(file => {
        html += `
          <div class="file-card" onclick="showFileDetail('${file.id}')">
            <div class="file-card-header">
              <span class="file-icon">${getFileIcon(file.mime_type)}</span>
              <div class="file-info">
                <div class="file-name">${escapeHtml(file.original_name)}</div>
                <div class="file-meta">${formatFileSize(file.file_size)} &middot; ${file.folder_name || 'Unassigned'}</div>
              </div>
            </div>
            <div class="file-labels">
              ${(file.labels || []).map(l => `<span class="file-label" style="background:${l.color}">${escapeHtml(l.name)}</span>`).join('')}
            </div>
          </div>
        `;
      });
      html += '</div></div>';
    }

    if (data.templates.length > 0) {
      html += `<div class="search-section"><h3>Templates (${data.templates.length})</h3>`;
      html += '<div class="templates-grid">';
      data.templates.forEach(tmpl => {
        html += `
          <div class="template-card">
            <div class="template-name">${escapeHtml(tmpl.name)}</div>
            <div class="template-meta">${tmpl.placeholder_count} placeholders</div>
            <div class="template-actions">
              <button class="btn btn-primary btn-sm" onclick="openFillTemplate('${tmpl.id}')">Fill</button>
            </div>
          </div>
        `;
      });
      html += '</div></div>';
    }

    if (data.filled_templates.length > 0) {
      html += `<div class="search-section"><h3>Filled Templates (${data.filled_templates.length})</h3>`;
      data.filled_templates.forEach(ft => {
        html += `<div class="file-card"><div class="file-name">${escapeHtml(ft.name)}</div></div>`;
      });
      html += '</div>';
    }

    if (!html) {
      html = '<div class="empty-state"><p>No results found.</p></div>';
    }

    container.innerHTML = html;
  } catch (err) {
    toast('Search failed', 'error');
  }
}

// ============================================================
// VIEW SWITCHING
// ============================================================
function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const viewEl = document.getElementById(`${view}-view`);
  if (viewEl) viewEl.classList.add('active');

  const navBtn = document.querySelector(`.nav-item[data-view="${view}"]`);
  if (navBtn) navBtn.classList.add('active');

  // Show/hide folder sidebar sections based on view
  const folderSection = document.getElementById('folder-tree-section');
  const labelFilterSection = document.getElementById('label-filter-section');

  if (view === 'files') {
    folderSection.style.display = '';
    labelFilterSection.style.display = '';
  } else {
    folderSection.style.display = 'none';
    labelFilterSection.style.display = 'none';
  }
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ============================================================
// MODAL HELPERS
// ============================================================
function showModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function hideModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// ============================================================
// UTILITIES
// ============================================================
function toast(message, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast ${type}`;
  setTimeout(() => el.classList.add('hidden'), 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + sizes[i];
}

function getFileIcon(mimeType) {
  if (!mimeType) return '\u{1F4C4}';
  if (mimeType.startsWith('image/')) return '\u{1F5BC}';
  if (mimeType === 'application/pdf') return '\u{1F4D5}';
  if (mimeType.includes('word') || mimeType.includes('document')) return '\u{1F4DD}';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '\u{1F4CA}';
  if (mimeType.startsWith('text/')) return '\u{1F4C3}';
  return '\u{1F4C4}';
}

function getCtopItemIcon(type) {
  switch (type) {
    case 'file': return '\u{1F4C4}';
    case 'template': return '\u{1F4DD}';
    case 'filled_template': return '\u{2705}';
    default: return '\u{1F4C4}';
  }
}
