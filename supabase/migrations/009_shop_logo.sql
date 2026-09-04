-- Per-shop logos.
--
-- A branch that trades under its own name — a wholesale counter, say — puts its
-- own mark on its bills. Null means "use the business-wide logo from Settings",
-- so nothing changes for a group that trades under one name everywhere.
--
-- Stored as a data URL rather than a link to a file: a bill has to render the
-- same in the browser, in the print dialog, and inside a PDF that gets emailed
-- on, and a link would need all three to be able to reach the host. Uploads are
-- downscaled in the browser before they arrive here.

alter table shops add column if not exists logo text;
