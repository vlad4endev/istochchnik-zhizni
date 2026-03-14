import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import { initDb } from './config/initDb';
import { resolveAuthSession } from './middleware/authSession';
import { enforceRoleAccess, resolveUserRole } from './middleware/roleAccess';
import routes from './routes';
import authRoutes from './routes/authRoutes';
import calendarRoutes from './routes/calendarRoutes';
import userRoutes from './routes/userRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(resolveAuthSession);

app.use('/api/auth', authRoutes);

app.use(resolveUserRole);
app.use(enforceRoleAccess);

app.get('/', (req, res) => {
  res.json({ message: 'Server is running' });
});

app.use('/api', routes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/users', userRoutes);

async function start(): Promise<void> {
  if (process.env.DATABASE_URL) {
    await initDb();
    console.log('Database tables initialized');
  }
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
