-- Development seed data. Loaded ONLY by docker-compose, never by the web
-- installer: docker-compose mounts this file alongside schema.sql, while the
-- installer reads schema.sql on its own.
--
-- Do not move any of this into schema.sql. Doing so would give every hosted
-- install an account whose password is published in this repository.
--
-- Demo login for the local Docker stack:  demo@example.com / demo12345
-- It is an administrator, so /admin is reachable out of the box. On a hosted
-- install the administrator is the account you create in the installer.

INSERT INTO users (email, name, password_hash, role, is_active, email_verified_at)
VALUES ('demo@example.com', 'Demo User', '$2y$10$/Q1.cy1f3ISbppp9LADZR.ZqNhygP6kw/.HnHbyJ5yUbtryWuC9UW', 'admin', 1, NOW())
ON DUPLICATE KEY UPDATE
  password_hash = VALUES(password_hash),
  name          = VALUES(name),
  role          = VALUES(role),
  is_active     = VALUES(is_active),
  email_verified_at = COALESCE(email_verified_at, NOW());
