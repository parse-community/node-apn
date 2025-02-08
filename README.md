# Node APN <!-- omit in toc -->

[![Build Status](https://github.com/parse-community/node-apn/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/parse-community/node-apn/actions/workflows/ci.yml?query=workflow%3Aci+branch%3Amaster)
[![Snyk Badge](https://snyk.io/test/github/parse-community/node-apn/badge.svg)](https://snyk.io/test/github/parse-community/parse-server-push-adapter)
[![Coverage](https://codecov.io/github/parse-community/node-apn/branch/master/graph/badge.svg)](https://app.codecov.io/github/parse-community/node-apn/tree/master)
[![auto-release](https://img.shields.io/badge/%F0%9F%9A%80-auto--release-9e34eb.svg)](https://github.com/parse-community/node-apn/releases)

[![npm latest version](https://img.shields.io/npm/v/@parse/node-apn.svg)](https://www.npmjs.com/package/@parse/node-apn)

---

A Node.js module for interfacing with the Apple Push Notification service.

---

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
  - [Load in the module](#load-in-the-module)
  - [Connecting](#connecting)
    - [Connecting through an HTTP proxy](#connecting-through-an-http-proxy)
    - [Using a pool of http/2 connections](#using-a-pool-of-http2-connections)
  - [Sending a notification](#sending-a-notification)
  - [Managing channels](#manage-channels)
  - [Sending a broadcast notification](#sending-a-broadcast-notification)

# Features

- Based on HTTP/2 based provider API
- Maintains a connection to the server to maximize notification batching and throughput.
- Automatically re-sends unsent notifications if an error occurs

# Installation

```bash
$ npm install @parse/node-apn --save
```

# Quick Start

This readme is a brief introduction; please refer to the full [documentation](doc/apn.markdown) in `doc/` for more details.

If you have previously used v1.x and wish to learn more about what's changed in v2.0, please see [What's New](doc/whats-new.markdown)

## Load in the module

```javascript
var apn = require('@parse/node-apn');
```

## Connecting
Create a new connection to the Apple Push Notification provider API, passing a dictionary of options to the constructor. You must supply your token credentials in the options.

```javascript
var options = {
  token: {
    key: "path/to/APNsAuthKey_XXXXXXXXXX.p8",
    keyId: "key-id",
    teamId: "developer-team-id"
  },
  production: false
};

const apnProvider = new apn.Provider(options);
```

By default, the provider will connect to the sandbox unless the environment variable `NODE_ENV=production` is set.

For more information about configuration options, consult the [provider documentation](doc/provider.markdown).

Help with preparing the key and certificate files for connection can be found in the [wiki][certificateWiki]

> [!WARNING] 
> You should only create one `Provider` per-process for each certificate/key pair you have. You do not need to create a new `Provider` for each notification. If you are only sending notifications to one app, there is no need for more than one `Provider`.
>
> If you are constantly creating `Provider` instances in your app, make sure to call `Provider.shutdown()` when you are done with each provider to release its resources and memory.

### Connecting through an HTTP proxy

If you need to connect through an HTTP proxy, you simply need to provide the `proxy: {host, port}` option when creating the provider. For example:

```javascript
var options = {
  token: {
    key: "path/to/APNsAuthKey_XXXXXXXXXX.p8",
    keyId: "key-id",
    teamId: "developer-team-id"
  },
  proxy: {
    host: "192.168.10.92",
    port: 8080
  }
  production: false
};

const apnProvider = new apn.Provider(options);
```

The provider will first send an HTTP CONNECT request to the specified proxy in order to establish an HTTP tunnel. Once established, it will create a new secure connection to the Apple Push Notification provider API through the tunnel.

### Using a pool of http/2 connections

Because http/2 already uses multiplexing, you probably don't need to use more than one client unless you are hitting http/2 concurrent request limits.

```javascript
var options = {
  // Round robin pool with 2 clients. More can be used if needed.
  clientCount: 2,
  token: {
    key: "path/to/APNsAuthKey_XXXXXXXXXX.p8",
    keyId: "key-id",
    teamId: "developer-team-id"
  },
  proxy: {
    host: "192.168.10.92",
    port: 8080
  },
  production: false
};

const apnProvider = new apn.MultiProvider(options);
```

## Sending a notification
To send a notification, you will first need a device token from your app as a string.

```javascript
let deviceToken = "a9d0ed10e9cfd022a61cb08753f49c5a0b0dfb383697bf9f9d750a1003da19c7"
```

Create a notification object, configuring it with the relevant parameters (See the [notification documentation](doc/notification.markdown) for more details.)

```javascript
let note = new apn.Notification();

note.expiry = Math.floor(Date.now() / 1000) + 3600; // Expires 1 hour from now.
note.badge = 3;
note.sound = "ping.aiff";
note.alert = "\uD83D\uDCE7 \u2709 You have a new message";
note.payload = {'messageFrom': 'John Appleseed'};
note.topic = "<your-app-bundle-id>";
```

Send the notification to the API with `send`, which returns a promise.

```javascript
try {
  const result = apnProvider.send(note, deviceToken);
  // see documentation for an explanation of result
} catch(error) {
  // Handle error...
}
```

This will result in the following notification payload being sent to the device.

```json
{"messageFrom":"John Appelseed","aps":{"badge":3,"sound":"ping.aiff","alert":"\uD83D\uDCE7 \u2709 You have a new message"}}
```

Create a Live Activity notification object and configure it with the relevant parameters (See the [notification documentation](doc/notification.markdown) for more details.)

```javascript
let note = new apn.Notification();

note.topic = "<your-app-bundle-id>.push-type.liveactivity";
note.expiry = Math.floor(Date.now() / 1000) + 3600; // Expires 1 hour from now.
note.pushType = "liveactivity",
note.badge = 3;
note.sound = "ping.aiff";
note.alert = "\uD83D\uDCE7 \u2709 You have a new message";
note.payload = {'messageFrom': 'John Appleseed'};
note.relevanceScore = 75,
note.timestamp = Math.floor(Date.now() / 1000); // Current time
note.staleDate = Math.floor(Date.now() / 1000) + (8 * 3600); // Expires 8 hour from now.
note.event = "update"
note.contentState = {}
```

Send the notification to the API with `send`, which returns a promise.

```javascript
try {
  const result = await apnProvider.send(note, deviceToken);
  // see the documentation for an explanation of the result
} catch (error) {
  // Handle error...
}
```

This will result in the following notification payload being sent to the device.


```json
{"messageFrom":"John Appleseed","aps":{"badge":3,"sound":"ping.aiff","alert":"\uD83D\uDCE7 \u2709 You have a new message", "relevance-score":75,"timestamp":1683129662,"stale-date":1683216062,"event":"update","content-state":{}}}
```

## Manage Channels
Starting in iOS 18 and iPadOS 18 Live Activities can be used to broadcast push notifications over channels. To do so, you will need your apps' `bundleId`. 

```javascript
let bundleId = "com.node.apn";
```

Create a notification object, configuring it with the relevant parameters (See the [notification documentation](doc/notification.markdown) for more details.)

```javascript
let note = new apn.Notification();

note.requestId = "0309F412-AA57-46A8-9AC6-B5AECA8C4594"; // Optional
note.payload = {'message-storage-policy': '1', 'push-type': 'liveactivity'}; // Required
```

Create a channel with `manageChannels` and the `create` action, which returns a promise.

```javascript
try {
  const result = await apnProvider.manageChannels(note, bundleId, 'create');
  // see the documentation for an explanation of the result
} catch (error) {
  // Handle error...
}
```

If the channel is created successfully, the result will look like the following:
```javascript
{ 
  apns-request-id: '0309F412-AA57-46A8-9AC6-B5AECA8C4594', 
  apns-channel-id: 'dHN0LXNyY2gtY2hubA==' // The new channel
}
```

Similarly, `manageChannels` has additional `action`s that allow you to `read`, `readAll`, and `delete` channels. The `read` and `delete` actions require similar information to the `create` example above, with the exception that they require `note.channelId` to be populated. To request all active channel id's, you can use the `readAll` action:

```javascript
try {
  const result = await apnProvider.manageChannels(note, bundleId, 'readAll');
  // see the documentation for an explanation of the result
} catch (error) {
  // Handle error...
}
```

After the promise is fulfilled, `result` will look like the following:

```javascript
{ 
  apns-request-id: 'some id value', 
  channels: ['dHN0LXNyY2gtY2hubA==', 'eCN0LXNyY2gtY2hubA==' ...] // A list of active channels
}
```

Further information about managing channels can be found in [Apple's documentation](https://developer.apple.com/documentation/usernotifications/sending-channel-management-requests-to-apns).

## Sending A Broadcast Notification
Starting in iOS 18 and iPadOS 18, after a channel is created using `manageChannels`, broadcast push notifications can be sent to any device subscribed to the respective `channelId` created for a `bundleId`. A broadcast notification looks similar to a standard Live Activity notification mentioned above but requires `note.channelId` to be populated. An example is below:

```javascript
let note = new apn.Notification();

note.channelId = "dHN0LXNyY2gtY2hubA=="; // Required
note.expiry = Math.floor(Date.now() / 1000) + 3600; // Expires 1 hour from now.
note.pushType = "liveactivity",
note.badge = 3;
note.sound = "ping.aiff";
note.alert = "\uD83D\uDCE7 \u2709 You have a new message";
note.payload = {'messageFrom': 'John Appleseed'};
note.relevanceScore = 75,
note.timestamp = Math.floor(Date.now() / 1000); // Current time
note.staleDate = Math.floor(Date.now() / 1000) + (8 * 3600); // Expires 8 hour from now.
note.event = "update"
note.contentState = {}
```

Send the broadcast notification to the API with `broadcast`, which returns a promise.

```javascript
try {
  const result = await apnProvider.broadcast(note, bundleId);
  // see documentation for an explanation of result
} catch (error) {
  // Handle error...
}
```

Further information about broadcast notifications can be found in [Apple's documentation](https://developer.apple.com/documentation/usernotifications/sending-broadcast-push-notification-requests-to-apns).
