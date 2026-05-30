import { startServer } from './src/index.js';

console.log('[boot] Node', process.version);
console.log('[boot] cwd', process.cwd());
console.log('[boot] PORT env', process.env.PORT || '(Hostinger should set PORT=3000)');
console.log('[boot] NODE_ENV', process.env.NODE_ENV || '(not set)');

process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException:', err?.stack || err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('[fatal] unhandledRejection:', err?.stack || err);
  process.exit(1);
});

try {
  startServer();
} catch (err) {
  console.error('[boot] Failed to start server:', err?.stack || err);
  process.exit(1);
}
