/**
 * API Client for PID-Builder File Organization Tool
 */
const API = {
  base: '/api',
  token: localStorage.getItem('token'),

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  },

  async request(method, path, body, isFormData = false) {
    const headers = {};

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    const opts = { method, headers };

    if (body) {
      opts.body = isFormData ? body : JSON.stringify(body);
    }

    const res = await fetch(`${this.base}${path}`, opts);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `Request failed: ${res.status}`);
    }

    return data;
  },

  // Auth
  login(email, password) {
    return this.request('POST', '/auth/login', { email, password });
  },

  register(name, email, password) {
    return this.request('POST', '/auth/register', { name, email, password });
  },

  getMe() {
    return this.request('GET', '/auth/me');
  },

  // Projects
  listProjects() {
    return this.request('GET', '/projects');
  },

  createProject(name, description) {
    return this.request('POST', '/projects', { name, description });
  },

  getProject(id) {
    return this.request('GET', `/projects/${id}`);
  },

  deleteProject(id) {
    return this.request('DELETE', `/projects/${id}`);
  },

  // Folders
  listFolders(projectId) {
    return this.request('GET', `/folders?project_id=${projectId}`);
  },

  createFolder(projectId, name, parentId, description) {
    return this.request('POST', '/folders', {
      project_id: projectId,
      name,
      parent_id: parentId || null,
      description,
    });
  },

  deleteFolder(id) {
    return this.request('DELETE', `/folders/${id}`);
  },

  // Files
  listFiles(projectId, folderId, labelId) {
    let url = `/files?project_id=${projectId}`;
    if (folderId) url += `&folder_id=${folderId}`;
    if (labelId) url += `&label_id=${labelId}`;
    return this.request('GET', url);
  },

  uploadFiles(projectId, files, folderId) {
    const form = new FormData();
    form.append('project_id', projectId);
    if (folderId) form.append('folder_id', folderId);
    for (const file of files) {
      form.append('files', file);
    }
    return this.request('POST', '/files/upload', form, true);
  },

  getFile(id) {
    return this.request('GET', `/files/${id}`);
  },

  getFileDownloadUrl(id) {
    return this.request('GET', `/files/${id}/download`);
  },

  updateFile(id, data) {
    return this.request('PUT', `/files/${id}`, data);
  },

  reanalyzeFile(id) {
    return this.request('POST', `/files/${id}/reanalyze`);
  },

  deleteFile(id) {
    return this.request('DELETE', `/files/${id}`);
  },

  // Labels
  listLabels(projectId) {
    return this.request('GET', `/labels?project_id=${projectId}`);
  },

  createLabel(name, color, projectId) {
    return this.request('POST', '/labels', { name, color, project_id: projectId });
  },

  deleteLabel(id) {
    return this.request('DELETE', `/labels/${id}`);
  },

  assignLabel(fileId, labelId) {
    return this.request('POST', '/labels/assign', { file_id: fileId, label_id: labelId });
  },

  removeLabel(fileId, labelId) {
    return this.request('DELETE', '/labels/assign', { file_id: fileId, label_id: labelId });
  },

  // Templates
  listTemplates(projectId) {
    return this.request('GET', `/templates?project_id=${projectId}`);
  },

  uploadTemplate(projectId, file, name, description) {
    const form = new FormData();
    form.append('project_id', projectId);
    form.append('template', file);
    if (name) form.append('name', name);
    if (description) form.append('description', description);
    return this.request('POST', '/templates/upload', form, true);
  },

  getTemplate(id) {
    return this.request('GET', `/templates/${id}`);
  },

  fillTemplate(id, values, name, projectId) {
    return this.request('POST', `/templates/${id}/fill`, {
      values,
      name,
      project_id: projectId,
    });
  },

  getTemplateDownloadUrl(id) {
    return this.request('GET', `/templates/${id}/download`);
  },

  deleteTemplate(id) {
    return this.request('DELETE', `/templates/${id}`);
  },

  // CTOPs
  listCtops(projectId) {
    return this.request('GET', `/ctops?project_id=${projectId}`);
  },

  createCtop(projectId, name, description) {
    return this.request('POST', '/ctops', { project_id: projectId, name, description });
  },

  getCtop(id) {
    return this.request('GET', `/ctops/${id}`);
  },

  addCtopItem(ctopId, itemType, itemId) {
    const body = { item_type: itemType };
    if (itemType === 'file') body.file_id = itemId;
    else if (itemType === 'template') body.template_id = itemId;
    else if (itemType === 'filled_template') body.filled_template_id = itemId;
    return this.request('POST', `/ctops/${ctopId}/items`, body);
  },

  removeCtopItem(ctopId, itemId) {
    return this.request('DELETE', `/ctops/${ctopId}/items/${itemId}`);
  },

  updateCtop(id, data) {
    return this.request('PUT', `/ctops/${id}`, data);
  },

  deleteCtop(id) {
    return this.request('DELETE', `/ctops/${id}`);
  },

  // Search
  search(projectId, q, labels, type) {
    let url = `/search?project_id=${projectId}`;
    if (q) url += `&q=${encodeURIComponent(q)}`;
    if (labels) url += `&labels=${labels}`;
    if (type) url += `&type=${type}`;
    return this.request('GET', url);
  },
};
