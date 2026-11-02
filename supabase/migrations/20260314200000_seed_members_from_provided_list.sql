-- DEPRECATED data seed (was: church member roster insert-by-name).
-- Fresh / zero deploys must start with an empty members table.
-- Optional seed: npm run db:seed-members / SEED_MEMBERS_ON_INIT=true
-- (list lives in src/config/memberSeedSql.ts and scripts/seed-members-base.sql).
-- Kept as a no-op so historical migration order stays intact.
SELECT 1;
