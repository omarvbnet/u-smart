-- Add TECHNICIAN and PERSONAL to RequesterRole enum if not present
-- Required for registration requests with these roles
ALTER TYPE "RequesterRole" ADD VALUE IF NOT EXISTS 'TECHNICIAN';
ALTER TYPE "RequesterRole" ADD VALUE IF NOT EXISTS 'PERSONAL';
