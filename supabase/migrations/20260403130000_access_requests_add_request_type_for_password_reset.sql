ALTER TABLE access_requests
ADD COLUMN IF NOT EXISTS request_type TEXT;

UPDATE access_requests
SET request_type = 'registration'
WHERE request_type IS NULL OR request_type NOT IN ('registration', 'password_reset');

ALTER TABLE access_requests
ALTER COLUMN request_type SET DEFAULT 'registration';

ALTER TABLE access_requests
ALTER COLUMN request_type SET NOT NULL;

ALTER TABLE access_requests
DROP CONSTRAINT IF EXISTS access_requests_request_type_check;

ALTER TABLE access_requests
ADD CONSTRAINT access_requests_request_type_check
CHECK (request_type IN ('registration', 'password_reset'));

CREATE INDEX IF NOT EXISTS access_requests_request_type_idx
ON access_requests (request_type);
