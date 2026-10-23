-- Mobile-width scan: axe also runs at 390px. An issue's fingerprint doesn't include the width,
-- so issues found at both widths are one row; viewports says where it was seen.
-- Existing rows come from desktop-only scans.
alter table issues add column viewports text[] not null default '{desktop}'
  check (viewports <@ array['desktop', 'mobile'] and cardinality(viewports) > 0);

-- Why the mobile pass failed on a page whose desktop pass worked (its issues are then desktop only).
alter table pages add column mobile_error text;
