module.exports = function (dependencies) {
  const { Client } = dependencies;
  /**
   * This is a simple round-robin pool of http/2 clients.
   * Most use cases would not need this.
   *
   * While http/2 itself supports multiplexing,
   * there are limits on the number of active simultaneous requests
   * that may be hit.
   *
   * This approach was chosen because it's easy to reason about compared to
   * switching to an http2 pool implementation.
   */
  function MultiClient(options) {
    const count = parseInt(options.clientCount || 2, 10);
    if (count < 1 || !Number.isFinite(count)) {
      throw new Error(`Expected positive client count but got ${options.clientCount}`);
    }
    const clients = [];
    for (let i = 0; i < count; i++) {
      clients.push(new Client(options));
    }
    this.clients = clients;
    this.clientIndex = 0;
  }

  MultiClient.prototype.chooseSingleClient = function () {
    const client = this.clients[this.clientIndex];
    this.clientIndex = (this.clientIndex + 1) % this.clients.length;
    return client;
  };

  MultiClient.prototype.write = async function write(
    notification,
    subDirectory,
    type,
    method,
    count
  ) {
    return await this.chooseSingleClient().write(notification, subDirectory, type, method, count);
  };

  MultiClient.prototype.shutdown = async function shutdown(callback) {
    let callCount = 0;
    const multiCallback = () => {
      callCount++;
      if (callCount === this.clients.length) {
        if (callback) {
          callback();
        }
      }
    };
    for (const client of this.clients) {
      await client.shutdown(multiCallback);
    }
  };

  MultiClient.prototype.setLogger = function (newLogger, newErrorLogger = null) {
    this.clients.forEach(client => client.setLogger(newLogger, newErrorLogger));
  };

  return MultiClient;
};
