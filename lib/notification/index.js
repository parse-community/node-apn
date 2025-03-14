/**
 * Create a notification
 * @constructor
 */
function Notification(payload) {
  this.encoding = 'utf8';
  this.payload = {};
  this.compiled = false;

  this.aps = {};
  this.expiry = -1;
  this.priority = 10;

  if (payload) {
    /* TODO: consider using Object.entries in a separate change from introducing linting. */
    for (const key in payload) {
      if (Object.hasOwnProperty.call(payload, key)) {
        this[key] = payload[key];
      }
    }
  }
}

Notification.prototype = require('./apsProperties');

// Create setter methods for properties
[
  'payload',
  'expiry',
  'priority',
  'alert',
  'body',
  'locKey',
  'locArgs',
  'title',
  'subtitle',
  'titleLocKey',
  'titleLocArgs',
  'subtitleLocKey',
  'subtitleLocArgs',
  'action',
  'actionLocKey',
  'launchImage',
  'badge',
  'sound',
  'contentAvailable',
  'mutableContent',
  'mdm',
  'urlArgs',
  'category',
  'threadId',
  'interruptionLevel',
  'targetContentIdentifier',
  'relevanceScore',
  'timestamp',
  'staleDate',
  'event',
  'contentState',
  'dismissalDate',
  'filterCriteria',
  'inputPushChannel',
  'inputPushToken',
  'attributesType',
  'attributes',
].forEach(propName => {
  const methodName = 'set' + propName[0].toUpperCase() + propName.slice(1);
  Notification.prototype[methodName] = function (value) {
    this[propName] = value;
    return this;
  };
});

Notification.prototype.headers = function headers() {
  const headers = {};

  if (Number.isInteger(this.priority)) {
    headers['apns-priority'] = this.priority;
  }

  if (this.id) {
    headers['apns-id'] = this.id;
  }

  if (this.collapseId) {
    headers['apns-collapse-id'] = this.collapseId;
  }

  if (this.requestId) {
    headers['apns-request-id'] = this.requestId;
  }

  if (this.channelId) {
    headers['apns-channel-id'] = this.channelId;
  }

  if (this.expiry >= 0) {
    headers['apns-expiration'] = this.expiry;
  }

  if (this.topic) {
    headers['apns-topic'] = this.topic;
  }

  if (this.pushType) {
    headers['apns-push-type'] = this.pushType;
  }

  return headers;
};

Notification.prototype.removeNonChannelRelatedProperties = function () {
  this.priority = 10;
  this.id = undefined;
  this.collapseId = undefined;
  this.topic = undefined;
  this.pushType = undefined;
};

/**
 * Add live activity push type if it's not already provided.
 *
 * @remarks
 * LiveActivity is the only current type supported.
 */
Notification.prototype.addPushTypeToPayloadIfNeeded = function () {
  if (this.rawPayload == undefined && this.payload['push-type'] == undefined) {
    this.payload['push-type'] = 'liveactivity';
  }
};

/**
 * Compile a notification down to its JSON format. Compilation is final, changes made to the notification after this method is called will not be reflected in further calls.
 * @returns {String} JSON payload for the notification.
 * @since v1.3.0
 */
Notification.prototype.compile = function () {
  if (!this.compiled) {
    this.compiled = JSON.stringify(this);
  }
  return this.compiled;
};

/**
 * @returns {Number} Byte length of the notification payload
 * @since v1.2.0
 */
Notification.prototype.length = function () {
  return Buffer.byteLength(this.compile(), this.encoding || 'utf8');
};

/**
 * @private
 */
Notification.prototype.apsPayload = function () {
  const { aps } = this;

  return Object.keys(aps).find(key => aps[key] !== undefined) ? aps : undefined;
};

Notification.prototype.toJSON = function () {
  if (this.rawPayload != null) {
    return this.rawPayload;
  }

  if (typeof this._mdm === 'string') {
    return { mdm: this._mdm };
  }

  return { ...this.payload, aps: this.apsPayload() };
};

module.exports = Notification;
