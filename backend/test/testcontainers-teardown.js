module.exports = async () => {
  const container = globalThis.__VALORA_PG_CONTAINER__;
  if (container) {
    await container.stop();
  }
};
