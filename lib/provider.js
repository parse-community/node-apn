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

  Provider.prototype.send = async function send(notification, recipients) {
    const builtNotification = {
      headers: notification.headers(),
      body: notification.compile(),
    };

    if (!Array.isArray(recipients)) {
      recipients = [recipients];
    }

    const sentNotifications = await Promise.allSettled(
      recipients.map(
        async token => await this.client.write(builtNotification, token, 'device', 'post')
      )
    );
    const sent = [];
    const failed = [];

    sentNotifications.forEach(sentNotification => {
      if (sentNotification.status == 'fulfilled') {
        const sentNotificationValue = sentNotification.value;
        if (sentNotificationValue.status || sentNotificationValue.error) {
          failed.push(sentNotificationValue);
        } else {
          sent.push(sentNotificationValue);
        }
      } else {
        failed.push(sentNotification.reason);
      }
    });

    return { sent, failed };
  };

  Provider.prototype.manageChannels = async function manageChannels(
    notifications,
    bundleId,
    action
  ) {
    let type = 'channels';
    let method = 'post';

    if (!Array.isArray(notifications)) {
      notifications = [notifications];
    }

    switch (action) {
      case 'create':
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
        throw error;
      }
    }

    const sentNotifications = await Promise.allSettled(
      notifications.map(async notification => {
        if (action == 'create') {
          notification.addPushTypeToPayloadIfNeeded();
        }
        notification.removeNonChannelRelatedProperties();
        const builtNotification = {
          headers: notification.headers(),
          body: notification.compile(),
        };

        return await this.client.write(builtNotification, bundleId, type, method);
      })
    );
    const sent = [];
    const failed = [];

    sentNotifications.forEach(sentNotification => {
      if (sentNotification.status == 'fulfilled') {
        const sentNotificationValue = sentNotification.value;
        if (sentNotificationValue.status || sentNotificationValue.error) {
          failed.push(sentNotificationValue);
        } else {
          sent.push(sentNotificationValue);
        }
      } else {
        failed.push(sentNotification.reason);
      }
    });

    return { sent, failed };
  };

  Provider.prototype.broadcast = async function broadcast(notifications, bundleId) {
    if (!Array.isArray(notifications)) {
      notifications = [notifications];
    }

    const sentNotifications = await Promise.allSettled(
      notifications.map(async notification => {
        const builtNotification = {
          headers: notification.headers(),
          body: notification.compile(),
        };

        return await this.client.write(builtNotification, bundleId, 'broadcasts', 'post');
      })
    );
    const sent = [];
    const failed = [];

    sentNotifications.forEach(sentNotification => {
      if (sentNotification.status == 'fulfilled') {
        const sentNotificationValue = sentNotification.value;
        if (sentNotificationValue.status || sentNotificationValue.error) {
          failed.push(sentNotificationValue);
        } else {
          sent.push(sentNotificationValue);
        }
      } else {
        failed.push(sentNotification.reason);
      }
    });

    return { sent, failed };
  };

  Provider.prototype.shutdown = function shutdown(callback) {
    this.client.shutdown(callback);
  };

  return Provider;
};
