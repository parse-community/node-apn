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
    HTTP2_METHOD_POST,
    NGHTTP2_CANCEL,
  } = http2.constants;

  const TIMEOUT_STATUS = '(timeout)';
  const ABORTED_STATUS = '(aborted)';
  const ERROR_STATUS = '(error)';

  function Client (options) {
    this.config = config(options);
    this.healthCheckInterval = setInterval(() => {
      if (this.session && !this.session.closed && !this.session.destroyed && !this.isDestroyed) {
        this.session.ping((error, duration) => {
          if (error) {
            logger("No Ping response after " + duration + " ms with error:" + error.message);
            return;
          }
          logger("Ping response after " + duration + " ms");
        });
      }
    }, this.config.heartBeat).unref();
  }

  // Session should be passed except when destroying the client
  Client.prototype.destroySession = function (session, callback) {
    if (!session) {
      session = this.session;
    }
    if (session) {
      if (this.session === session) {
        this.session = null;
      }
      if (!session.destroyed) {
        session.destroy();
      }
    }
    if (callback) {
      callback();
    }
  }

  // Session should be passed except when destroying the client
  Client.prototype.closeAndDestroySession = function (session, callback) {
    if (!session) {
      session = this.session;
    }
    if (session) {
      if (this.session === session) {
        this.session = null;
      }
      if (!session.closed) {
        session.close(() => this.destroySession(session, callback));
      } else {
        this.destroySession(session, callback)
      }
    } else if (callback) {
      callback();
    }
  }

  Client.prototype.write = function write (notification, device, count) {
    if (this.isDestroyed) {
      return Promise.resolve({ device, error: new VError("client is destroyed") });
    }

    // Connect session
    if (!this.session || this.session.closed || this.session.destroyed) {
      const session = this.session = http2.connect(this._mockOverrideUrl || `https://${this.config.address}`, this.config);

      this.session.on("close", () => {
        if (logger.enabled) {
          logger("Session closed");
        }
        this.destroySession(session);
      });

      this.session.on("socketError", (error) => {
        if (logger.enabled) {
          logger(`Socket error: ${error}`);
        }
        this.closeAndDestroySession(session);
      });

      this.session.on("error", (error) => {
        if (logger.enabled) {
          logger(`Session error: ${error}`);
        }
        this.closeAndDestroySession(session);
      });

      this.session.on("goaway", (errorCode, lastStreamId, opaqueData) => {
        if (logger.enabled) {
          logger(`GOAWAY received: (errorCode ${errorCode}, lastStreamId: ${lastStreamId}, opaqueData: ${opaqueData})`);
        }
        this.closeAndDestroySession(session);
      });

      if (logger.enabled) {
        this.session.on("connect", () => {
          logger("Session connected");
        });

        this.session.on("frameError", (frameType, errorCode, streamId) => {
          logger(`Frame error: (frameType: ${frameType}, errorCode ${errorCode}, streamId: ${streamId})`);
        });
      }
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

    const request = this.session.request(headers)

    request.setEncoding("utf8");

    request.on("response", (headers) => {
      status = headers[HTTP2_HEADER_STATUS];
    });

    request.on("data", (data) => {
      responseData += data;
    });

    request.write(notification.body);

    return new Promise ( resolve => {
      request.on("end", () => {
        try {
          if (logger.enabled) {
            logger(`Request ended with status ${status} and responseData: ${responseData}`);
          }

          if (status === 200) {
            resolve({ device });
          } else if ([TIMEOUT_STATUS, ABORTED_STATUS, ERROR_STATUS].includes(status)) {
            return;
          } else if (responseData !== "") {
            const response = JSON.parse(responseData);

            if (status === 403 && response.reason === "ExpiredProviderToken" && retryCount < 2) {
              this.config.token.regenerate(tokenGeneration);
              resolve(this.write(notification, device, retryCount + 1));
              return;
            } else if (status === 500 && response.reason === "InternalServerError") {
              this.closeAndDestroySession();
              let error = new VError("Error 500, stream ended unexpectedly");
              resolve({ device, error });
              return;
            }

            resolve({ device, status, response });
          } else {
            let error = new VError("stream ended unexpectedly");
            resolve({ device, error });
          }
        } catch (e) {
          const error = new VError(e, 'Unexpected error processing APNs response');
          if (logger.enabled) {
            logger(`Unexpected error processing APNs response: ${e.message}`);
          }
          resolve({ device, error });
        }
      });

      request.setTimeout(this.config.requestTimeout, () => {
        if (logger.enabled) {
          logger('Request timeout');
        }

        status = TIMEOUT_STATUS;

        request.close(NGHTTP2_CANCEL);

        resolve({ device, error: new VError("apn write timeout") });
      });

      request.on("aborted", () => {
        if (logger.enabled) {
          logger('Request aborted');
        }

        status = ABORTED_STATUS;

        resolve({ device, error: new VError("apn write aborted") });
      });

      request.on("error", (error) => {
        if (logger.enabled) {
          logger(`Request error: ${error}`);
        }

        status = ERROR_STATUS;

        if (typeof error === "string") {
          error = new VError("apn write failed: %s", error);
        } else {
          error = new VError(error, "apn write failed");
        }

        resolve({ device, error });
      });

      if (logger.enabled) {
        request.on("frameError", (frameType, errorCode, streamId) => {
          logger(`Request frame error: (frameType: ${frameType}, errorCode ${errorCode}, streamId: ${streamId})`);
        });
      }

      request.end();
    });
  };

  Client.prototype.shutdown = function shutdown(callback) {
    if (this.isDestroyed) {
      if (callback) {
        callback();
      }
      return;
    }
    if (logger.enabled) {
      logger('Called client.shutdown()');
    }
    this.isDestroyed = true;
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.closeAndDestroySession(undefined, callback);
  };

  return Client;
}
