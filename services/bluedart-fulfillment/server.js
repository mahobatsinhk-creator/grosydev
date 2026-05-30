import { startServer } from './src/index.js';

console.log('[boot] Node', process.version);
console.log('[boot] cwd', process.cwd());
console.log('[boot] PORT env', process.env.PORT || '(default from config)');

process.on('uncaughtException', (err) => {
  console.error('[fatal]', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('[fatal]', err);
  process.exit(1);
});

try {
  startServer();
} catch (err) {
  console.error('[boot] Failed to start server:', err);
  process.exit(1);
}
