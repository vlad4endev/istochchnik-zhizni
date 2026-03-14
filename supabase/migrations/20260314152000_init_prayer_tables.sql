CREATE TABLE IF NOT EXISTS members (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  prayer_request TEXT
);

CREATE TABLE IF NOT EXISTS global_themes (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  bible_verse TEXT,
  prayer_points TEXT
);

CREATE TABLE IF NOT EXISTS ministries (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  prayer_points TEXT
);

CREATE TABLE IF NOT EXISTS backsliders (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL
);
