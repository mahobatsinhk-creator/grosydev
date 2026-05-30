import { startServer } from './src/index.js';

process.on('uncaughtException', (err) => {
  console.error('[fatal]', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('[fatal]', err);
  process.exit(1);
});

startServer();
