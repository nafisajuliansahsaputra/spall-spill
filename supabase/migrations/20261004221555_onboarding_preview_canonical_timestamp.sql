-- Preserve existing migration history; canonicalize digest inputs additively.
-- Session/Prefer timezone differences must not invalidate unchanged previews.
alter function core.preview_destination_safety(text) set timezone = 'UTC';
