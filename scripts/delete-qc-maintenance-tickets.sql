-- Destructive: removes Provisor QC + maintenance tickets from visitor_requests.
-- In this app, those tickets use serviceSlug = 'quality-control-supervision' (see app/api/tickets/route.ts).
-- Cascades: ticket_status_logs, ticket_comments, ticket_evidence, coordinator_ticket_charges.
-- SetNull: private_company_material_items.usedTicketId, private_company_material_movements.ticketId.
--
-- Run (from repo root, with DATABASE_URL set — prisma.config.ts prefers DATABASE_URL_LOCAL when NODE_ENV != production):
--   npx prisma db execute --file scripts/delete-qc-maintenance-tickets.sql

BEGIN;

DELETE FROM "notifications"
WHERE "ticketId" IS NOT NULL
  AND "ticketId" IN (
    SELECT "id" FROM "visitor_requests" WHERE "serviceSlug" = 'quality-control-supervision'
  );

DELETE FROM "visitor_requests" WHERE "serviceSlug" = 'quality-control-supervision';

COMMIT;
