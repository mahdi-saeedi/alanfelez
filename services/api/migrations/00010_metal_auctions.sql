-- +goose Up
-- Metal auctions («مزایدات», client 2026-10-26): auction notices of companies and organisations (ingots and
-- intermediate products, scrap, raw materials), entered by staff. Information only: there's no bidding on the site.
-- Everyone sees the title, metal, category, quantity and status; the deadline, place, organiser, details and the PDF
-- notice need auctions.read (Gold). They replace the IME offerings on the site; market.ime_offerings and its rows
-- stay untouched (no longer shown) until the owner decides to drop them.
CREATE TABLE market.auctions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_fa     text     NOT NULL CHECK (char_length(title_fa) BETWEEN 2 AND 200),
  title_en     text,
  metal_id     smallint NOT NULL REFERENCES market.metals (id),
  -- The same groups as the chart page: ingots and intermediate products, scrap, raw materials.
  category     text     NOT NULL CHECK (category IN ('intermediate', 'scrap', 'raw')),
  quantity     bigint   NOT NULL CHECK (quantity > 0),
  unit         text     NOT NULL CHECK (unit IN ('ton', 'kg', 'piece')),
  -- Set by staff: open (در حال برگزاری), paused (متوقف‌شده), closed (پایان‌یافته).
  status       text     NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paused', 'closed')),
  deadline_at  timestamptz,
  location_fa  text,
  location_en  text,
  organizer_fa text,
  organizer_en text,
  details_fa   text, -- plain text; line breaks are kept
  details_en   text,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auctions_list_idx ON market.auctions (created_at DESC);

-- The auction's PDF notice (Gold). In Postgres until Object Storage exists (ADR-0027): at most one per auction,
-- 10 MB, checked to be a PDF by the API. Kept apart so listing auctions never reads the files.
CREATE TABLE market.auction_files (
  auction_id  uuid PRIMARY KEY REFERENCES market.auctions (id) ON DELETE CASCADE,
  file_name   text   NOT NULL,
  size_bytes  int    NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  content     bytea  NOT NULL,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE market.auction_files;
DROP TABLE market.auctions;
