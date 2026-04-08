-- Replace the placeholders below before running this script.
-- Recommended execution:
--   mysql -uroot -p < deploy/mysql/init-database.sql

CREATE DATABASE IF NOT EXISTS `__DB_NAME__`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS '__DB_USER__'@'127.0.0.1' IDENTIFIED BY '__DB_PASSWORD__';
CREATE USER IF NOT EXISTS '__DB_USER__'@'localhost' IDENTIFIED BY '__DB_PASSWORD__';

GRANT ALL PRIVILEGES ON `__DB_NAME__`.* TO '__DB_USER__'@'127.0.0.1';
GRANT ALL PRIVILEGES ON `__DB_NAME__`.* TO '__DB_USER__'@'localhost';

FLUSH PRIVILEGES;
