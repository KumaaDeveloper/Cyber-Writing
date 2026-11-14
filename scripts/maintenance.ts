import { rows, sql } from "../lib/db";
import { cleanDeletedAssets } from "../lib/assets";
await rows(sql`DELETE FROM admin_sessions WHERE expires_at<now()`);
await rows(
  sql`DELETE FROM rate_limits WHERE expires_at<now()-interval '1 day'`,
);
await cleanDeletedAssets();
console.log(
  "Expired sessions, rate-limit records, and pending deleted assets processed.",
);
process.exit(0);
