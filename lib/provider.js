const EventEmitter = require('events');
const VError = require('verror');

module.exports = function (dependencies) {
  const Client = dependencies.Client;

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

    return Promise.all(
      recipients.map(token => this.client.write(builtNotification, token, 'device', 'post'))
    ).then(responses => {
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
    });
  };

  Provider.prototype.manageChannels = function manageChannels(notification, bundleId, action) {
    let type = 'channels';
    let method = 'post';

    switch (action) {
      case 'create':
        if (notification['push-type'] == null) {
          // Add live activity push type if it's not already provided.
          // Live activity is the only current type supported.
          // Note, this seems like it should be lower cased, but the
          // docs shows it in the current format.
          notification['push-type'] = 'LiveActivity';
        }
        type = 'channels';
        method = 'post';
        break;
      case 'read':
        type = 'channels';
        method = 'get';
        break;
      case 'readAll':
        type = 'allChannels';
        method = 'get';
        break;
      case 'delete':
        type = 'channels';
        method = 'delete';
        break;
      default: {
        const error = {
          bundleId,
          error: new VError(`the action "${action}" is not supported`),
        };
        return Promise.resolve(error);
      }
    }

    const builtNotification = {
      headers: notification.headers(),
      body: notification.compile(),
    };

    return this.client.write(builtNotification, bundleId, type, method);
  };

  Provider.prototype.broadcast = function broadcast(notification, bundleId) {
    const builtNotification = {
      headers: notification.headers(),
      body: notification.compile(),
    };

    return this.client.write(builtNotification, bundleId, 'broadcasts', 'post');
  };

  Provider.prototype.shutdown = function shutdown(callback) {
    this.client.shutdown(callback);
  };

  return Provider;
};
