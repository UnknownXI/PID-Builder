-- Seed data: Predefined labels for engineering document management
-- These are global labels (project_id IS NULL, is_predefined = TRUE)

INSERT INTO labels (name, color, is_predefined, project_id, created_by) VALUES
    -- Document Type Labels
    ('PID', '#EF4444', TRUE, NULL, NULL),
    ('Isometric', '#F97316', TRUE, NULL, NULL),
    ('Datasheet', '#EAB308', TRUE, NULL, NULL),
    ('Specification', '#84CC16', TRUE, NULL, NULL),
    ('GA Drawing', '#22C55E', TRUE, NULL, NULL),
    ('Single Line Diagram', '#14B8A6', TRUE, NULL, NULL),
    ('Wiring Diagram', '#06B6D4', TRUE, NULL, NULL),
    ('Plot Plan', '#3B82F6', TRUE, NULL, NULL),
    ('Equipment Layout', '#6366F1', TRUE, NULL, NULL),
    ('Structural Drawing', '#8B5CF6', TRUE, NULL, NULL),
    ('Civil Drawing', '#A855F7', TRUE, NULL, NULL),
    ('Instrument Index', '#D946EF', TRUE, NULL, NULL),
    ('Line List', '#EC4899', TRUE, NULL, NULL),
    ('Valve List', '#F43F5E', TRUE, NULL, NULL),
    ('Cable Schedule', '#78716C', TRUE, NULL, NULL),

    -- Discipline Labels
    ('Piping', '#DC2626', TRUE, NULL, NULL),
    ('Electrical', '#2563EB', TRUE, NULL, NULL),
    ('Instrumentation', '#7C3AED', TRUE, NULL, NULL),
    ('Mechanical', '#059669', TRUE, NULL, NULL),
    ('Civil/Structural', '#D97706', TRUE, NULL, NULL),
    ('Process', '#0891B2', TRUE, NULL, NULL),
    ('HVAC', '#4F46E5', TRUE, NULL, NULL),
    ('Fire & Safety', '#E11D48', TRUE, NULL, NULL),

    -- Status Labels
    ('Draft', '#94A3B8', TRUE, NULL, NULL),
    ('For Review', '#F59E0B', TRUE, NULL, NULL),
    ('Approved', '#10B981', TRUE, NULL, NULL),
    ('As-Built', '#6366F1', TRUE, NULL, NULL),
    ('Superseded', '#EF4444', TRUE, NULL, NULL),

    -- Document Source Labels
    ('Scanned', '#78716C', TRUE, NULL, NULL),
    ('Native Digital', '#3B82F6', TRUE, NULL, NULL),
    ('Vendor Document', '#F97316', TRUE, NULL, NULL),
    ('Client Document', '#8B5CF6', TRUE, NULL, NULL);
