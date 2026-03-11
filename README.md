# PID-Builder File Organization Tool

Engineering document management system with AI-powered auto-sorting, Word template processing, and custom document packages (CTOPs).

## Features

- **File Storage & Organization** - Upload and store engineering documents (PIDs, isometrics, scanned docs, etc.) in nested folder structures
- **AI-Powered Auto-Sorting** - Files are automatically analyzed by Anthropic Claude on upload to suggest labels and folder placement
- **Project Labels** - Predefined engineering labels (PID, Isometric, Piping, Electrical, etc.) plus custom labels for easy filtering
- **Word Template Engine** - Upload `.docx` templates with `<<PLACEHOLDER>>` markers; the system auto-detects placeholders and lets users fill them to generate documents
- **CTOPs (Document Packages)** - Combine files and filled templates into custom document packages
- **Multi-User Auth** - JWT-based authentication with project-level access control
- **Full-Text Search** - Search across files, templates, and filled documents with label filtering

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: PostgreSQL
- **File Storage**: S3-compatible (AWS S3 / MinIO)
- **AI**: Anthropic Claude API
- **Frontend**: Vanilla HTML/CSS/JS

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- S3-compatible storage (MinIO for local dev)

### Installation

1. Install dependencies:
   ```bash
   cd server
   npm install
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with your database, S3, and Anthropic API credentials
   ```

3. Initialize database:
   ```bash
   npm run db:init
   ```

4. Start the server:
   ```bash
   npm start
   # Or for development with auto-reload:
   npm run dev
   ```

5. Open `http://localhost:3000` in your browser

## API Endpoints

### Auth
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Projects
- `GET /api/projects` - List projects
- `POST /api/projects` - Create project
- `GET /api/projects/:id` - Get project
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project
- `POST /api/projects/:id/members` - Add member

### Folders
- `GET /api/folders?project_id=X` - List folders
- `POST /api/folders` - Create folder
- `PUT /api/folders/:id` - Update/move folder
- `DELETE /api/folders/:id` - Delete folder

### Files
- `GET /api/files?project_id=X&folder_id=Y&label_id=Z` - List files with filters
- `POST /api/files/upload` - Upload files (multipart, triggers AI analysis)
- `GET /api/files/:id` - Get file details
- `GET /api/files/:id/download` - Get download URL
- `PUT /api/files/:id` - Update file metadata
- `POST /api/files/:id/reanalyze` - Re-trigger AI analysis
- `DELETE /api/files/:id` - Delete file

### Labels
- `GET /api/labels?project_id=X` - List labels
- `POST /api/labels` - Create custom label
- `PUT /api/labels/:id` - Update label
- `DELETE /api/labels/:id` - Delete custom label
- `POST /api/labels/assign` - Assign label to file
- `DELETE /api/labels/assign` - Remove label from file

### Templates
- `GET /api/templates?project_id=X` - List templates
- `POST /api/templates/upload` - Upload Word template (detects `<<PLACEHOLDERS>>`)
- `GET /api/templates/:id` - Get template with placeholders
- `POST /api/templates/:id/fill` - Fill template with data, generates document
- `GET /api/templates/:id/download` - Download template
- `DELETE /api/templates/:id` - Delete template

### CTOPs
- `GET /api/ctops?project_id=X` - List CTOPs
- `POST /api/ctops` - Create CTOP
- `GET /api/ctops/:id` - Get CTOP with items
- `POST /api/ctops/:id/items` - Add item
- `PUT /api/ctops/:id/items/reorder` - Reorder items
- `DELETE /api/ctops/:id/items/:itemId` - Remove item
- `PUT /api/ctops/:id` - Update CTOP
- `DELETE /api/ctops/:id` - Delete CTOP

### Search
- `GET /api/search?project_id=X&q=term&labels=id1,id2&type=file|template|all`

## Database Schema

Key tables: `users`, `projects`, `project_members`, `folders`, `files`, `file_labels`, `labels`, `templates`, `template_placeholders`, `ctops`, `ctop_items`, `filled_templates`, `filled_template_values`

See `server/db/schema.sql` for the complete schema.
