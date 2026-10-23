-- Likely right target for a link issue: { url, reason }. A live page with a similar slug for a dead
-- internal link, the closest existing ID for a broken anchor, or a Wayback Machine copy for a dead
-- external link. Null when nothing close was found, and on scans from before this.
alter table links add column replacement jsonb;
