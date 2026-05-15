-- Allow cancelled tickets in workflow.
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
