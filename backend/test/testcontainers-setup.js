const { PostgreSqlContainer } = require('@testcontainers/postgresql');
const { execSync } = require('child_process');

module.exports = async () => {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('valora_test')
    .withUsername('valora')
    .withPassword('valora')
    .start();

  const databaseUrl = container.getConnectionUri();
  process.env.DATABASE_URL = databaseUrl;

  execSync('npx prisma migrate deploy', {
    cwd: __dirname + '/..',
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });

  globalThis.__VALORA_PG_CONTAINER__ = container;
};
