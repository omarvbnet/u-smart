-- Add WORKER to RequesterRole enum (admin-assigned, view-only role)
ALTER TYPE "RequesterRole" ADD VALUE IF NOT EXISTS 'WORKER';
