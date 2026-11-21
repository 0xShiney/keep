-- Creates the app database next to Forgejo's. Runs once, on an empty volume.
-- The application never creates databases and never touches the forgejo one.
SELECT 'CREATE DATABASE keep'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keep')\gexec
