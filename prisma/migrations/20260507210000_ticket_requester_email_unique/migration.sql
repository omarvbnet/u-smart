-- Unique non-null emails for ticket_requesters (PostgreSQL allows multiple NULLs).
CREATE UNIQUE INDEX "ticket_requesters_email_key" ON "ticket_requesters" ("email");
