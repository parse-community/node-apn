/// <reference types="node" />

import { EventEmitter } from 'events';

export interface ProviderToken {
  /**
   * The filename of the provider token key (as supplied by Apple) to load from disk, or a Buffer/String containing the key data.
   */
  key: Buffer|string;
  /**
   * The ID of the key issued by Apple
   */
  keyId: string;
  /**
   * ID of the team associated with the provider token key
   */
  teamId: string;
}

export interface ProviderOptions {
  /**
   * Configuration for Provider Authentication Tokens. (Defaults to: null i.e. fallback to Certificates)
   */
  token?: ProviderToken;
  /**
   * The filename of the connection certificate to load from disk, or a Buffer/String containing the certificate data. (Defaults to: `cert.pem`)
   */
  cert?: string|Buffer;
  /**
   * The filename of the connection key to load from disk, or a Buffer/String containing the key data. (Defaults to: `key.pem`)
   */
  key?: string|Buffer;
  /**
   * An array of trusted certificates. Each element should contain either a filename to load, or a Buffer/String (in PEM format) to be used directly. If this is omitted several well known "root" CAs will be used. - You may need to use this as some environments don't include the CA used by Apple (entrust_2048)
   */
  ca?: (string|Buffer)[];
  /**
   * File path for private key, certificate and CA certs in PFX or PKCS12 format, or a Buffer containing the PFX data. If supplied will always be used instead of certificate and key above
   */
  pfx?: string|Buffer;
  /**
   * The passphrase for the connection key, if required
   */
  passphrase?: string;
  /**
   * Specifies which environment to connect to: Production (if true) or Sandbox - The hostname will be set automatically. (Defaults to NODE_ENV == "production", i.e. false unless the NODE_ENV environment variable is set accordingly)
   */
  production?: boolean;
  /**
   * The address of the APNs server to send notifications to. If not provided, will connect to standard APNs server
   */
  address?: string;
  /**
   * The port of the APNs server to send notifications to. (Defaults to 443)
   */
  port?: number;
  /**
   * The address of the APNs channel management server to send notifications to. If not provided, will connect to standard APNs channel management server
   */
  manageChannelsAddress?: string;
  /**
   * The port of the APNs channel management server to send notifications to. If not provided, will connect to standard APNs channel management port
   */
  manageChannelsPort?: number;
  /**
   * Connect through an HTTP proxy when sending notifications
   */
  proxy?: { host: string, port: number|string }
  /**
   * Connect through an HTTP proxy when managing channels
   */
  manageChannelsProxy?: { host: string, port: number|string }
  /**
   * Reject Unauthorized property to be passed through to tls.connect() (Defaults to `true`)
   */
  rejectUnauthorized?: boolean;
  /**
   * The maximum number of connection failures that will be tolerated before `apn` will "terminate". (Defaults to: 3)
   */
  connectionRetryLimit?: number;
  /**
   * The delay interval in ms that apn will ping APNs servers. (Defaults to: 60000)
   */
  heartBeat?: number;
  /**
   * The maximum time in ms that apn will wait for a response to a request. (Defaults to: 5000)
   */
  requestTimeout?: number;
}

export interface MultiProviderOptions extends ProviderOptions {
  /**
   * The number of clients in this round robin pool. Defaults to 2.
   */
  clientCount?: number
}

interface ApsAlert {
  body?: string
  "loc-key"?: string
  "loc-args"?: any[]
  title?: string
  "title-loc-key"?: string
  "title-loc-args"?: any[]
  "subtitle-loc-key"?: string
  "subtitle-loc-args"?: any[]
  action?: string
  "action-loc-key"?: string
}

interface ApsSound {
  critical: number; // 1
  name: string;
  volume: number;
}

interface Aps {
  alert?: string | ApsAlert
  "launch-image"?: string
  badge?: number
  sound?: string | ApsSound
  "content-available"?: undefined | 1
  "mutable-content"?: undefined | 1
  "url-args"?: string[]
  category?: string
  "thread-id"?: string
  "target-content-id"?: string 
  "interruption-level"?: string | ApsNotificationInterruptionLevel
  "relevance-score"?: number
  "filter-criteria"?: string
  "stale-date"?: number
  "content-state"?: Object
  timestamp?: number
  event?: string
  "dismissal-date"?: number
  "input-push-channel"?: string
  "input-push-token"?: number
  "attributes-type"?: string
  attributes?: Object
}

export interface ResponseSent {
  device: string;
}

export interface BroadcastResponse {
  bundleId: string;
  "apns-request-id"?: string;
  "apns-channel-id"?: string;
  "message-storage-policy"?: number;
  "push-type"?: string;
  "channels"?: string[];
}

export interface LoggerResponse extends Partial<ResponseSent>, Partial<BroadcastResponse> {}

export interface ResponseFailure {
  device: string;
  error?: Error;
  status?: number;
  response?: {
    reason: string;
    timestamp?: string;
  };
}

export interface BroadcastResponseFailure extends Omit<ResponseFailure, "device"> {
  bundleId: string;
}

export interface LoggerResponseFailure extends Partial<ResponseFailure>, Partial<BroadcastResponseFailure> {}

export interface Responses<R,F> {
  sent: R[];
  failed: F[];
}

export class Provider extends EventEmitter {
  constructor(options: ProviderOptions);
  /**
   * This is main interface for sending notifications.
   *  
   * @remarks
   * Create a Notification object and pass it in, along with a single recipient or an array of them and node-apn will take care of the rest, delivering a copy of the notification to each recipient.
   *
   * @param notification - The notification to send.
   * @param recipients - A String or an Array of Strings containing the hex-encoded device token.
   */
  send(notification: Notification, recipients: string|string[]): Promise<Responses<ResponseSent,ResponseFailure>>;

  /**
   * Manage channels using a specific action.
   *
   * @param notifications - A Notification or an Array of Notifications to send. Each notification should specify the respective channelId it's directed to.
   * @param bundleId - The bundleId for your application.
   * @param action - Specifies the action to perform on the channel(s).
   */
  manageChannels(notifications: Notification|Notification[], bundleId: string, action: ChannelAction): Promise<Responses<BroadcastResponse,BroadcastResponseFailure>>;

  /**
   * Broadcast notificaitons to channel(s).
   *
   * @param notifications - A Notification or an Array of Notifications to send. Each notification should specify the respective channelId it's directed to.
   * @param bundleId: The bundleId for your application.
   */
  broadcast(notifications: Notification|Notification[], bundleId: string): Promise<Responses<BroadcastResponse,BroadcastResponseFailure>>;

  /**
   * Set an info logger, and optionally an errorLogger to separately log errors.
   *
   * @remarks
   * In order to log, these functions must have a property '.enabled' that is true.
   * (The default logger uses the npm 'debug' module which sets '.enabled'
   * based on the DEBUG environment variable)
   */
  setLogger(logger: (msg: string) => void, errorLogger?: (msg: string) => void): Promise<Responses<LoggerResponse,LoggerResponseFailure>>;

  /**
   * Indicate to node-apn that it should close all open connections when the queue of pending notifications is fully drained. This will allow your application to terminate.
   */
  shutdown(callback?: () => void): Promise<void>;
}

export class MultiProvider extends EventEmitter {
  constructor(options: MultiProviderOptions);
  /**
   * This is main interface for sending notifications.
   *  
   * @remarks
   * Create a Notification object and pass it in, along with a single recipient or an array of them and node-apn will take care of the rest, delivering a copy of the notification to each recipient.
   *
   * @param notification - The notification to send.
   * @param recipients - A String or an Array of Strings containing the hex-encoded device token.
   */
  send(notification: Notification, recipients: string|string[]): Promise<Responses<ResponseSent,ResponseFailure>>;

  /**
   * Manage channels using a specific action.
   *
   * @param notifications - A Notification or an Array of Notifications to send. Each notification should specify the respective channelId it's directed to.
   * @param bundleId - The bundleId for your application.
   * @param action - Specifies the action to perform on the channel(s).
   */
  manageChannels(notifications: Notification|Notification[], bundleId: string, action: ChannelAction): Promise<Responses<BroadcastResponse,BroadcastResponseFailure>>;

  /**
   * Broadcast notificaitons to channel(s).
   *
   * @param notifications - A Notification or an Array of Notifications to send. Each notification should specify the respective channelId it's directed to.
   * @param bundleId: The bundleId for your application.
   */
  broadcast(notifications: Notification|Notification[], bundleId: string): Promise<Responses<BroadcastResponse,BroadcastResponseFailure>>;

  /**
   * Set an info logger, and optionally an errorLogger to separately log errors.
   *
   * @remarks
   * In order to log, these functions must have a property '.enabled' that is true.
   * (The default logger uses the npm 'debug' module which sets '.enabled'
   * based on the DEBUG environment variable)
   */
  setLogger(logger: (msg: string) => void, errorLogger?: (msg: string) => void): Promise<Responses<LoggerResponse,LoggerResponseFailure>>;

  /**
   * Indicate to node-apn that it should close all open connections when the queue of pending notifications is fully drained. This will allow your application to terminate.
   */
  shutdown(callback?: () => void): Promise<void>;
}

export type NotificationPushType = 'background' | 'alert' | 'voip' | 'pushtotalk' | 'liveactivity' | 'location' | 'complication' | 'fileprovider' | 'mdm';

export type ChannelAction = 'create' | 'read' | 'readAll' | 'delete';

export type ApsNotificationInterruptionLevel = 'passive' | 'active' | 'time-sensitive' | 'critical';

export interface NotificationAlertOptions {
  title?: string;
  subtitle?: string;
  body: string;
  "title-loc-key"?: string;
  "title-loc-args"?: string[];
  "subtitle-loc-key"?: string;
  "subtitle-loc-args"?: string[];
  "action-loc-key"?: string;
  "loc-key"?: string;
  "loc-args"?: string[];
  "launch-image"?: string;
}

export class Notification {
  /**
   * You can optionally pass in an object representing the payload, or configure properties on the returned object.
   */
  constructor(payload?: any);

  /**
   * Required: The destination topic for the notification.
   */
  public topic: string;
  /**
   * A UUID to identify the notification with APNS. If an id is not supplied, APNS will generate one automatically. If an error occurs the response will contain the id. This property populates the apns-id header.
   */
  public id: string;
  /**
   * A UUID to identify this request.
   */
  public requestId: string;
  /**
   * A base64-encoded string that identifies the channel to publish the payload.
     The channel ID is generated by sending channel creation request to APNs.
   */
  public channelId: string;
  /**
   * Multiple notifications with same collapse identifier are displayed to the user as a single notification. The value should not exceed 64 bytes.
   */
  public collapseId: string;
  /**
   * The UNIX timestamp representing when the notification should expire. This does not contribute to the 2048 byte payload size limit. An expiry of 0 indicates that the notification expires immediately.
   */
  public expiry: number;
  /**
   * Provide one of the following values:
   *
   * - 10 - The push message is sent immediately. (Default)
   *   > The push notification must trigger an alert, sound, or badge on the device. It is an error use this priority for a push that contains only the content-available key.
   * - 5 - The push message is sent at a time that conserves power on the device receiving it.
   */
  public priority: number;
  /**
   * The type of the notification.
   */
  public pushType: NotificationPushType;
  /**
   * An app-specific identifier for grouping related notifications.
   */
  public threadId: string;

  /**
   * This Object is JSON encoded and sent as the notification payload. When properties have been set on notification.aps (either directly or with convenience setters) these are added to the payload just before it is sent. If payload already contains an aps property it is replaced.
   */
  public payload: any;
  public aps: Aps;

  /**
   * If supplied this payload will be encoded and transmitted as-is. The convenience setters will have no effect on the JSON output.
   */
  public rawPayload: any;

  /**
   * The value to specify for `payload.aps.badge`
   */
  public badge: number;
  /**
   * The value to specify for `payload.aps.sound`
   */
  public sound: string | ApsSound;
  /**
   * The value to specify for `payload.aps.alert` can be either a `String` or an `Object` as outlined by the payload documentation.
   */
  public alert: string|NotificationAlertOptions;
  /**
   * Setting this to true will specify "content-available" in the payload when it is compiled.
   */
  public contentAvailable: boolean;
  /**
   *
   */
  public mutableContent: boolean;
  /**
   * The value to specify for the `mdm` field where applicable.
   */
  public mdm: string|Object;
  /**
   * The value to specify for `payload.aps['url-args']`. This used for Safari Push NOtifications and should be an array of values in accordance with the Web Payload Documentation.
   */
  public urlArgs: string[];
}

export function token(token: (string | Buffer)) : string
