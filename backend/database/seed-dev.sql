-- Development seed data. Loaded ONLY by docker-compose, never by the web
-- installer: docker-compose mounts this file alongside schema.sql, while the
-- installer reads schema.sql on its own.
--
-- Do not move any of this into schema.sql. Doing so would give every hosted
-- install an account whose password is published in this repository.
--
-- Demo login for the local Docker stack:  demo@example.com / demo12345

INSERT INTO users (email, name, password_hash)
VALUES ('demo@example.com', 'Demo User', '$2y$10$KfvtoPLMCMdLayOq5bjwz.DGsgIp8puvvf6h64Kfkp8LXN2D2Oa6G')
ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), name = VALUES(name);
