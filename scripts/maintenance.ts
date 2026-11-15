import { rows, sql } from "../lib/db";
import { cleanupExpiredDrafts } from "../lib/maintenance";
import { cleanDeletedAssets } from "../lib/assets";
await rows(sql`DELETE FROM admin_sessions WHERE expires_at<now()`);
await rows(
  sql`DELETE FROM rate_limits WHERE expires_at<now()-interval '1 day'`,
);
let expired = 0;
for (;;) { const count = await cleanupExpiredDrafts(); expired += count; if (count < 100) break; }
await cleanDeletedAssets();
console.log(
  `Deleted ${expired} expired draft(s); sessions, rate limits, and deleted assets processed.`,
);
process.exit(0);
