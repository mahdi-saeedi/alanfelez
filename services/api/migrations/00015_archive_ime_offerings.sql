-- +goose Up
-- The IME daily offerings are no longer shown since 2026-10-26 (the metal auctions, 00010, replaced them). The owner OK'd
-- removing them on 2026-10-27. Nothing reads them any more, so the table leaves the app's schemas, but its rows are kept
-- in the "archive" schema until the first database backup that contains them exists; then a later migration drops
-- archive.ime_offerings (docs/TODO.md). Moving a table is instant and keeps its rows, indexes and constraints.
CREATE SCHEMA IF NOT EXISTS archive;
COMMENT ON SCHEMA archive IS 'Tables the app no longer uses, kept until a backup holds them; dropped by a later migration.';
ALTER TABLE market.ime_offerings SET SCHEMA archive;

-- +goose Down
ALTER TABLE archive.ime_offerings SET SCHEMA market;
DROP SCHEMA archive;
