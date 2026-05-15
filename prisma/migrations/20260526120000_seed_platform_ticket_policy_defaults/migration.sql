-- Ensure cancellation / resubmit work after deploy: seed defaults when lists are still empty.
UPDATE "provisor_platform_settings"
SET
  "ticketCancellationReasons" = ARRAY[
    'Site no longer needed',
    'Duplicate ticket',
    'Rescheduled',
    'Budget or project cancelled',
    'Other'
  ]::TEXT[],
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'default'
  AND COALESCE(cardinality("ticketCancellationReasons"), 0) = 0;

UPDATE "provisor_platform_settings"
SET
  "ticketResubmitReasons" = ARRAY[
    'Update site or contact details',
    'Correct design or specifications',
    'Add or fix attachments',
    'Clarify scope with requester',
    'Other'
  ]::TEXT[],
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'default'
  AND COALESCE(cardinality("ticketResubmitReasons"), 0) = 0;
