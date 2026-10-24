-- +goose Up
-- The eNamad trust seal for alanfelez.ir (id and Code from its public HTML snippet, given by the client on
-- 2026-10-24). Staff change it in admin → Site settings; an empty id or code hides the badge.
INSERT INTO app.site_settings (key, value)
VALUES ('enamad', '{"id": "8262525", "code": "ecnZDeWC0m4Cv2DpKq1yUjNBv7unCgOo"}')
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DELETE FROM app.site_settings WHERE key = 'enamad';
