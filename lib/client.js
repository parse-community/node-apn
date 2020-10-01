"use strict";

const VError = require("verror");
const extend = require("./util/extend");

module.exports = function (dependencies) {
  const logger = dependencies.logger;
  const config = dependencies.config;
  const http2 = dependencies.http2;

  const {
    HTTP2_HEADER_STATUS,
    HTTP2_HEADER_SCHEME,
    HTTP2_HEADER_METHOD,
    HTTP2_HEADER_AUTHORITY,
    HTTP2_HEADER_PATH,
    HTTP2_METHOD_POST
  } = http2.constants;

  const safeCloseSession = (session, callback) => {
    if (session && !session.destroyed && !session._nodeApnIsDestroying) {
      session._nodeApnIsDestroying = true;
      const startDestroying = () => {
        if (!session.destroyed) {
          session._nodeApnIsDestroying = true;
          session.destroy();
        }
        if (callback) {
          callback();
        }
      };
      if (session.closed) {
        startDestroying();
      } else {
        session.close(startDestroying);
      }
    } else {
      if (callback) {
        callback();
      }
    }
  };

  function Client (options) {
    this.config = config(options);
    this.healthCheckInterval = setInterval(() => {
         if (this.session && !this.session.destroyed) {
             this.session.ping((error, duration) => {
                 if (error) {
                     logger("No Ping response after " + duration + " ms");
                 }
                 logger("Ping response after " + duration + " ms");
             })
         }
     }, this.config.heartBeat).unref();
  }

  Client.prototype._createSession = function() {
    const url = this._mockOverrideUrl || `https://${this.config.address}`;
    // Get the reference to the current session so that
    // we don't unintentionally destroy a different session on an async callback
    const session = http2.connect(url, this.config);

    session.on("socketError", (error) => {
      if (logger.enabled) {
        logger(`Socket error: ${error}`);
      }
      safeCloseSession(session);
    });
    session.on("error", (error) => {
      if (logger.enabled) {
        logger(`Session error: ${error}`);
      }
      safeCloseSession(session);
    });

    session.on("goaway", (errorCode, lastStreamId, opaqueData) => {
      logger(`GOAWAY received: (errorCode ${errorCode}, lastStreamId: ${lastStreamId}, opaqueData: ${opaqueData})`);
      // gracefully stop accepting new streams
      // This may be redundant, since nodejs http2 client is supposed to shut down automatically on receiving a goaway frame
      safeCloseSession(session);
    });

    if (logger.enabled) {
      session.on("connect", () => {
        logger("Session connected");
      });
      session.on("close", () => {
        logger("Session closed");
      });
      session.on("frameError", (frameType, errorCode, streamId) => {
        logger(`Frame error: (frameType: ${frameType}, errorCode ${errorCode}, streamId: ${streamId})`);
      });
    }
    return session;
  };

  /**
   * @param {Notification} notification the notification data to send through APNs
   * @param {string} device the device token
   * @param {number} [count] the number of retries that have occurred so far
   * @returns {Promise<{device:string, error?: VError}>} object with device, optional error.
   */
  Client.prototype.write = function write (notification, device, count = 0) {
    return new Promise((resolve) => {
      // Connect session
      if (!this.session || this.session.destroyed || this.session._nodeApnIsDestroying) {
        logger('creating a new APNs session');
        this.session = this._createSession();
      }

      let tokenGeneration = null;
      let status = null;
      let responseData = "";
      let retryCount = count || 0;

      const headers = extend({
        [HTTP2_HEADER_SCHEME]: "https",
        [HTTP2_HEADER_METHOD]: HTTP2_METHOD_POST,
        [HTTP2_HEADER_AUTHORITY]: this.config.address,
        [HTTP2_HEADER_PATH]: `/3/device/${device}`,
      }, notification.headers);

      if (this.config.token) {
        if (this.config.token.isExpired(3300)) {
          this.config.token.regenerate(this.config.token.generation);
        }
        headers.authorization = `bearer ${this.config.token.current}`;
        tokenGeneration = this.config.token.generation;
      }
      const currentSession = this.session;

      const request = currentSession.request(headers)
      const timeout = this.config.timeout || 10000;

      request.setTimeout(timeout, () => {
        const errorMessage = `Forcibly closing connection to APNs after reaching the request timeout of ${timeout} milliseconds`;
        // The first call to resolve will be what the promise resolves to.
        resolve({device, error: new VError(errorMessage)});
        if (currentSession !== this.session) {
          return;
        }
        if (currentSession.destroyed) {
          return;
        }
        logger(errorMessage);
        safeCloseSession(currentSession);
        this.session = null;
      });

      request.setEncoding("utf8");

      request.on("response", (headers) => {
        status = headers[HTTP2_HEADER_STATUS];
      });

      request.on("data", (data) => {
        responseData += data;
      });

      request.write(notification.body);

      request.on("end", () => {
        try {
          if (logger.enabled) {
            logger(`Request ended with status ${status} and responseData: ${responseData}`);
          }

          if (status === 200) {
            resolve({ device });
          } else if (responseData !== "") {
            const response = JSON.parse(responseData);

            if (status === 403 && response.reason === "ExpiredProviderToken" && retryCount < 2) {
              this.config.token.regenerate(tokenGeneration);
              resolve(this.write(notification, device, retryCount + 1));
              return;
            } else if (status === 500 && response.reason === "InternalServerError") {
              let error = new VError("Error 500, stream ended unexpectedly");
              resolve({ device, error });

              safeCloseSession(currentSession);
              this.session = null;
              return;
            }

            resolve({ device, status, response });
          } else {
            let error = new VError("stream ended unexpectedly");
            resolve({ device, error });
          }
        } catch (e) {
          const error = new VError(e, 'Unexpected error processing APNs response');
          logger(`Unexpected error processing APNs response: ${e.message}`);
          resolve({ device, error });
        }
      });

      request.on("error", (error) => {
        if (logger.enabled) {
          logger(`Request error: ${error}`);
        }

        if (typeof error === "string") {
          error = new VError("apn write failed: %s", err);
        } else {
          error = new VError(error, "apn write failed");
        }
        resolve({ device, error });
      });

      request.end();
    });
  };

  Client.prototype.shutdown = function shutdown(callback) {
    logger('Called client.shutdown()');
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.session) {
      safeCloseSession(this.session, callback);
      this.session = null;
    } else {
      if (callback) {
        callback();
      }
    }
  };

  return Client;
}
