import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  },
};
