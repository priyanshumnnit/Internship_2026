const dotenv = require('dotenv');
const http = require('http');

dotenv.config();

const app = require('./app');
const prisma = require('./lib/prisma');

const port = Number(process.env.PORT || 4000);

let server = null;

async function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`${signal} received. Closing backend connections...`);

  await prisma.$disconnect().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Error while disconnecting Prisma:', error);
  });

  if (!server) {
    process.exit(0);
    return;
  }

  server.close(() => {
    process.exit(0);
  });
}

async function startServer() {
  try {
    await prisma.connectWithRetry({
      attempts: 8,
      initialDelayMs: 1000,
    });

    server = http.createServer(app);

    server.on('error', async (error) => {
      if (error.code === 'EADDRINUSE') {
        // eslint-disable-next-line no-console
        console.error(`Port ${port} is already in use. Another backend process is already running on this port, so nodemon cannot start a second copy.`);
        // eslint-disable-next-line no-console
        console.error(`Stop the process using port ${port} or start this server with a different PORT value.`);
      } else {
        // eslint-disable-next-line no-console
        console.error(`Backend failed to bind on port ${port}.`, error);
      }

      await prisma.$disconnect().catch(() => {});
      process.exit(1);
    });

    server.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Blue Collar backend listening on http://localhost:${port}`);
      // eslint-disable-next-line no-console
      console.log('MongoDB connection verified.');
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to connect to MongoDB during startup.', error);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});

startServer();
