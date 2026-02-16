-- PID-Builder File Organization Tool - Database Schema
-- PostgreSQL

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS & AUTH
-- ============================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user', -- 'admin', 'user'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_owner ON projects(owner_id);

-- Project membership / roles
CREATE TABLE project_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'editor', -- 'admin', 'editor', 'viewer'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

CREATE INDEX idx_pm_project ON project_members(project_id);
CREATE INDEX idx_pm_user ON project_members(user_id);

-- ============================================================
-- FOLDERS (nested, self-referencing)
-- ============================================================
CREATE TABLE folders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    path TEXT NOT NULL, -- materialized path e.g. '/root/subfolder/child'
    description TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_folders_project ON folders(project_id);
CREATE INDEX idx_folders_parent ON folders(parent_id);
CREATE INDEX idx_folders_path ON folders(path);

-- ============================================================
-- LABELS (predefined + custom)
-- ============================================================
CREATE TABLE labels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) NOT NULL DEFAULT '#3B82F6', -- hex color
    is_predefined BOOLEAN NOT NULL DEFAULT FALSE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE, -- NULL for global predefined
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_labels_project ON labels(project_id);
CREATE INDEX idx_labels_predefined ON labels(is_predefined);

-- ============================================================
-- FILES
-- ============================================================
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
    original_name VARCHAR(500) NOT NULL,
    storage_key VARCHAR(1000) NOT NULL, -- S3 key
    mime_type VARCHAR(255),
    file_size BIGINT, -- bytes
    uploaded_by UUID NOT NULL REFERENCES users(id),
    ai_analyzed BOOLEAN NOT NULL DEFAULT FALSE,
    ai_summary TEXT,
    ai_suggested_folder UUID REFERENCES folders(id),
    ai_confidence FLOAT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_files_project ON files(project_id);
CREATE INDEX idx_files_folder ON files(folder_id);
CREATE INDEX idx_files_name ON files(original_name);
CREATE INDEX idx_files_uploaded_by ON files(uploaded_by);

-- File <-> Label association (many-to-many)
CREATE TABLE file_labels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    assigned_by VARCHAR(10) NOT NULL DEFAULT 'user', -- 'user' or 'ai'
    confidence FLOAT, -- AI confidence score (0-1), NULL for user-assigned
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(file_id, label_id)
);

CREATE INDEX idx_fl_file ON file_labels(file_id);
CREATE INDEX idx_fl_label ON file_labels(label_id);

-- ============================================================
-- TEMPLATES (Word documents with <<PLACEHOLDER>> markers)
-- ============================================================
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    storage_key VARCHAR(1000) NOT NULL, -- S3 key to .docx file
    uploaded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_templates_project ON templates(project_id);

-- Detected placeholders within templates
CREATE TABLE template_placeholders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    placeholder_name VARCHAR(255) NOT NULL, -- e.g. 'PROJECT_NAME'
    display_label VARCHAR(255), -- human-readable label
    field_type VARCHAR(50) NOT NULL DEFAULT 'text', -- 'text','date','number','select'
    default_value TEXT,
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(template_id, placeholder_name)
);

CREATE INDEX idx_tp_template ON template_placeholders(template_id);

-- ============================================================
-- FILLED TEMPLATES (must be created before ctop_items which references it)
-- ============================================================
CREATE TABLE filled_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    storage_key VARCHAR(1000), -- S3 key to generated .docx
    filled_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ft_template ON filled_templates(template_id);
CREATE INDEX idx_ft_project ON filled_templates(project_id);

-- ============================================================
-- CTOPs (Custom Document Packages)
-- ============================================================
CREATE TABLE ctops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- 'draft','in_progress','completed'
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ctops_project ON ctops(project_id);
CREATE INDEX idx_ctops_status ON ctops(status);

-- Items within a CTOP (files, templates, filled templates)
CREATE TABLE ctop_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ctop_id UUID NOT NULL REFERENCES ctops(id) ON DELETE CASCADE,
    item_type VARCHAR(50) NOT NULL, -- 'file', 'template', 'filled_template'
    file_id UUID REFERENCES files(id) ON DELETE SET NULL,
    template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
    filled_template_id UUID REFERENCES filled_templates(id) ON DELETE SET NULL,
    sort_order INT NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ci_ctop ON ctop_items(ctop_id);

-- Values used to fill placeholders
CREATE TABLE filled_template_values (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filled_template_id UUID NOT NULL REFERENCES filled_templates(id) ON DELETE CASCADE,
    placeholder_id UUID NOT NULL REFERENCES template_placeholders(id) ON DELETE CASCADE,
    value TEXT,
    UNIQUE(filled_template_id, placeholder_id)
);

CREATE INDEX idx_ftv_filled ON filled_template_values(filled_template_id);

-- ============================================================
-- SEARCH: Full-text search support
-- ============================================================
-- Add tsvector columns for full-text search
ALTER TABLE files ADD COLUMN search_vector tsvector;
ALTER TABLE templates ADD COLUMN search_vector tsvector;

-- Create GIN indexes for fast full-text search
CREATE INDEX idx_files_search ON files USING GIN(search_vector);
CREATE INDEX idx_templates_search ON templates USING GIN(search_vector);

-- Function to update file search vector
CREATE OR REPLACE FUNCTION files_search_update() RETURNS trigger AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.original_name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.ai_summary, '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER files_search_trigger
    BEFORE INSERT OR UPDATE OF original_name, ai_summary
    ON files
    FOR EACH ROW
    EXECUTE FUNCTION files_search_update();

-- Function to update template search vector
CREATE OR REPLACE FUNCTION templates_search_update() RETURNS trigger AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER templates_search_trigger
    BEFORE INSERT OR UPDATE OF name, description
    ON templates
    FOR EACH ROW
    EXECUTE FUNCTION templates_search_update();
