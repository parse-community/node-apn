const EventEmitter = require('events');

module.exports = function (dependencies) {
  const Client = dependencies.Client;
  const { http2 } = dependencies;

  const {
    HTTP2_METHOD_POST,
    HTTP2_METHOD_GET,
    HTTP2_METHOD_DELETE
  } = http2.constants;

  function Provider(options) {
    if (false === this instanceof Provider) {
      return new Provider(options);
    }

    this.client = new Client(options);

    EventEmitter.call(this);
  }

  Provider.prototype = Object.create(EventEmitter.prototype);

  Provider.prototype.send = function send(notification, recipients) {
    const builtNotification = {
      headers: notification.headers(),
      body: notification.compile(),
    };

    if (!Array.isArray(recipients)) {
      recipients = [recipients];
    }

    const method = HTTP2_METHOD_POST;
 
    return Promise.all(
      recipients.map(token => {
        let devicePath = `/3/device/${token}`;
        return this.client.writeV2(method, devicePath, builtNotification);
        // return this.client.write(builtNotification, token);
      }))
      .then(
      responses => {
        const sent = [];
        const failed = [];

        responses.forEach(response => {
          if (response.status || response.error) {
            failed.push(response);
          } else {
            sent.push(response);
          }
        });
        return { sent, failed };
      }
    );
  };

  Provider.prototype.shutdown = function shutdown(callback) {
    this.client.shutdown(callback);
  };

  return Provider;
};
