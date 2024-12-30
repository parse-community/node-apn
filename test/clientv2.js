const VError = require('verror');
const net = require('net');
const http2 = require('http2');

const {
  HTTP2_METHOD_POST,
  // HTTP2_METHOD_GET,
  // HTTP2_METHOD_DELETE
} = http2.constants;

const debug = require('debug')('apn');
const credentials = require('../lib/credentials')({
  logger: debug,
});

const TEST_PORT = 30939;
const LOAD_TEST_BATCH_SIZE = 2000;

const config = require('../lib/config')({
  logger: debug,
  prepareCertificate: () => ({}), // credentials.certificate,
  prepareToken: credentials.token,
  prepareCA: credentials.ca,
});
const Client = require('../lib/client')({
  logger: debug,
  config,
  http2,
});

debug.log = console.log.bind(console);

// XXX these may be flaky in CI due to being sensitive to timing,
// and if a test case crashes, then others may get stuck.
//
// Try to fix this if any issues come up.
describe('Client', () => {
  let server;
  let client;
  const MOCK_BODY = '{"mock-key":"mock-value"}';
  const MOCK_DEVICE_TOKEN = 'abcf0123abcf0123abcf0123abcf0123abcf0123abcf0123abcf0123abcf0123';
  // const BUNDLE_ID = 'com.node.apn';
  // const PATH_CHANNELS = `/1/apps/${BUNDLE_ID}/channels`;
  // const PATH_CHANNELS_ALL = `/1/apps/${BUNDLE_ID}/all-channels`;
  const PATH_DEVICE = `/3/device/${MOCK_DEVICE_TOKEN}`;
  // const PATH_BROADCAST = `/4/broadcasts/apps/${BUNDLE_ID}`;

  // Create an insecure http2 client for unit testing.
  // (APNS would use https://, not http://)
  // (It's probably possible to allow accepting invalid certificates instead,
  // but that's not the most important point of these tests)
  const createClient = (port, timeout = 500) => {
    const c = new Client({
      port: TEST_PORT,
      address: '127.0.0.1',
    });
    c._mockOverrideUrl = `http://127.0.0.1:${port}`;
    c.config.port = port;
    c.config.address = '127.0.0.1';
    c.config.requestTimeout = timeout;
    return c;
  };
  // Create an insecure server for unit testing.
  const createAndStartMockServer = (port, cb) => {
    server = http2.createServer((req, res) => {
      const buffers = [];
      req.on('data', data => buffers.push(data));
      req.on('end', () => {
        const requestBody = Buffer.concat(buffers).toString('utf-8');
        cb(req, res, requestBody);
      });
    });
    server.listen(port);
    server.on('error', err => {
      expect.fail(`unexpected error ${err}`);
    });
    // Don't block the tests if this server doesn't shut down properly
    server.unref();
    return server;
  };
  const createAndStartMockLowLevelServer = (port, cb) => {
    server = http2.createServer();
    server.on('stream', cb);
    server.listen(port);
    server.on('error', err => {
      expect.fail(`unexpected error ${err}`);
    });
    // Don't block the tests if this server doesn't shut down properly
    server.unref();
    return server;
  };

  afterEach(done => {
    const closeServer = () => {
      if (server) {
        server.close();
        server = null;
      }
      done();
    };
    if (client) {
      client.shutdown(closeServer);
      client = null;
    } else {
      closeServer();
    }
  });

  it('Treats HTTP 200 responses as successful', async () => {
    let didRequest = false;
    let establishedConnections = 0;
    let requestsServed = 0;
    const method = HTTP2_METHOD_POST;
    const path = PATH_DEVICE;
    server = createAndStartMockServer(TEST_PORT, (req, res, requestBody) => {
      expect(req.headers).to.deep.equal({
        ':authority': '127.0.0.1',
        ':method': method,
        ':path': path,
        ':scheme': 'https',
        'apns-someheader': 'somevalue',
      });
      expect(requestBody).to.equal(MOCK_BODY);
      // res.setHeader('X-Foo', 'bar');
      // res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.writeHead(200);
      res.end('');
      requestsServed += 1;
      didRequest = true;
    });
    server.on('connection', () => (establishedConnections += 1));
    await new Promise(resolve => server.on('listening', resolve));

    client = createClient(TEST_PORT);

    const runSuccessfulRequest = async () => {
      const mockHeaders = { 'apns-someheader': 'somevalue' };
      const mockNotification = {
        headers: mockHeaders,
        body: MOCK_BODY,
      };
      const result = await client.writeV2(method, path, mockNotification);
      expect(result).to.deep.equal({ method, path });
      expect(didRequest).to.be.true;
    };
    expect(establishedConnections).to.equal(0); // should not establish a connection until it's needed
    // Validate that when multiple valid requests arrive concurrently,
    // only one HTTP/2 connection gets established
    await Promise.all([
      runSuccessfulRequest(),
      runSuccessfulRequest(),
      runSuccessfulRequest(),
      runSuccessfulRequest(),
      runSuccessfulRequest(),
    ]);
    didRequest = false;
    await runSuccessfulRequest();
    expect(establishedConnections).to.equal(1); // should establish a connection to the server and reuse it
    expect(requestsServed).to.equal(6);
  });

  // Assert that this doesn't crash when a large batch of requests are requested simultaneously
  it('Treats HTTP 200 responses as successful (load test for a batch of requests)', async function () {
    this.timeout(10000);
    let establishedConnections = 0;
    let requestsServed = 0;
    const method = HTTP2_METHOD_POST;
    const path = PATH_DEVICE;
    server = createAndStartMockServer(TEST_PORT, (req, res, requestBody) => {
      expect(req.headers).to.deep.equal({
        ':authority': '127.0.0.1',
        ':method': method,
        ':path': path,
        ':scheme': 'https',
        'apns-someheader': 'somevalue',
      });
      expect(requestBody).to.equal(MOCK_BODY);
      // Set a timeout of 100 to simulate latency to a remote server.
      setTimeout(() => {
        res.writeHead(200);
        res.end('');
        requestsServed += 1;
      }, 100);
    });
    server.on('connection', () => (establishedConnections += 1));
    await new Promise(resolve => server.on('listening', resolve));

    client = createClient(TEST_PORT, 1500);

    const runSuccessfulRequest = async () => {
      const mockHeaders = { 'apns-someheader': 'somevalue' };
      const mockNotification = {
        headers: mockHeaders,
        body: MOCK_BODY,
      };
      const result = await client.writeV2(method, path, mockNotification);
      expect(result).to.deep.equal({ method, path });
    };
    expect(establishedConnections).to.equal(0); // should not establish a connection until it's needed
    // Validate that when multiple valid requests arrive concurrently,
    // only one HTTP/2 connection gets established
    const promises = [];
    for (let i = 0; i < LOAD_TEST_BATCH_SIZE; i++) {
      promises.push(runSuccessfulRequest());
    }

    await Promise.all(promises);
    expect(establishedConnections).to.equal(1); // should establish a connection to the server and reuse it
    expect(requestsServed).to.equal(LOAD_TEST_BATCH_SIZE);
  });

  // https://developer.apple.com/documentation/usernotifications/setting_up_a_remote_notification_server/handling_notification_responses_from_apns
  it('JSON decodes HTTP 400 responses', async () => {
    let didRequest = false;
    let establishedConnections = 0;
    server = createAndStartMockServer(TEST_PORT, (req, res, requestBody) => {
      expect(requestBody).to.equal(MOCK_BODY);
      // res.setHeader('X-Foo', 'bar');
      // res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.writeHead(400);
      res.end('{"reason": "BadDeviceToken"}');
      didRequest = true;
    });
    server.on('connection', () => (establishedConnections += 1));
    await new Promise(resolve => server.on('listening', resolve));

    client = createClient(TEST_PORT);
    const infoMessages = [];
    const errorMessages = [];
    const mockInfoLogger = message => {
      infoMessages.push(message);
    };
    const mockErrorLogger = message => {
      errorMessages.push(message);
    };
    mockInfoLogger.enabled = true;
    mockErrorLogger.enabled = true;
    client.setLogger(mockInfoLogger, mockErrorLogger);

    const runRequestWithBadDeviceToken = async () => {
      const mockHeaders = { 'apns-someheader': 'somevalue' };
      const mockNotification = {
        headers: mockHeaders,
        body: MOCK_BODY,
      };
      const method = HTTP2_METHOD_POST;
      const path = PATH_DEVICE;
      const result = await client.writeV2(method, path, mockNotification);
      expect(result).to.deep.equal({
        method: method,
        path: path,
        response: {
          reason: 'BadDeviceToken',
        },
        status: 400,
      });
      expect(didRequest).to.be.true;
      didRequest = false;
    };
    await runRequestWithBadDeviceToken();
    await runRequestWithBadDeviceToken();
    expect(establishedConnections).to.equal(1); // should establish a connection to the server and reuse it
    expect(infoMessages).to.deep.equal([
      'Session connected',
      'Request ended with status 400 and responseData: {"reason": "BadDeviceToken"}',
      'Request ended with status 400 and responseData: {"reason": "BadDeviceToken"}',
    ]);
    expect(errorMessages).to.deep.equal([]);
  });

  // node-apn started closing connections in response to a bug report where HTTP 500 responses
  // persisted until a new connection was reopened
  it('Closes connections when HTTP 500 responses are received', async () => {
    let establishedConnections = 0;
    let responseDelay = 50;
    server = createAndStartMockServer(TEST_PORT, (req, res, requestBody) => {
      // Wait 50ms before sending the responses in parallel
      setTimeout(() => {
        expect(requestBody).to.equal(MOCK_BODY);
        res.writeHead(500);
        res.end('{"reason": "InternalServerError"}');
      }, responseDelay);
    });
    server.on('connection', () => (establishedConnections += 1));
    await new Promise(resolve => server.on('listening', resolve));

    client = createClient(TEST_PORT);

    const runRequestWithInternalServerError = async () => {
      const mockHeaders = { 'apns-someheader': 'somevalue' };
      const mockNotification = {
        headers: mockHeaders,
        body: MOCK_BODY,
      };
      const method = HTTP2_METHOD_POST;
      const path = PATH_DEVICE;
      const result = await client.writeV2(method, path, mockNotification);
      expect(result).to.exist;
      expect(result.method).to.equal(method);
      expect(result.path).to.equal(path);
      expect(result.error).to.be.an.instanceof(VError);
      expect(result.error.message).to.have.string('stream ended unexpectedly');
    };
    await runRequestWithInternalServerError();
    await runRequestWithInternalServerError();
    await runRequestWithInternalServerError();
    expect(establishedConnections).to.equal(3); // should close and establish new connections on http 500
    // Validate that nothing wrong happens when multiple HTTP 500s are received simultaneously.
    // (no segfaults, all promises get resolved, etc.)
    responseDelay = 50;
    await Promise.all([
      runRequestWithInternalServerError(),
      runRequestWithInternalServerError(),
      runRequestWithInternalServerError(),
      runRequestWithInternalServerError(),
    ]);
    expect(establishedConnections).to.equal(4); // should close and establish new connections on http 500
  });

  it('Handles unexpected invalid JSON responses', async () => {
    let establishedConnections = 0;
    const responseDelay = 0;
    server = createAndStartMockServer(TEST_PORT, (req, res, requestBody) => {
      // Wait 50ms before sending the responses in parallel
      setTimeout(() => {
        expect(requestBody).to.equal(MOCK_BODY);
        res.writeHead(500);
        res.end('PC LOAD LETTER');
      }, responseDelay);
    });
    server.on('connection', () => (establishedConnections += 1));
    await new Promise(resolve => server.on('listening', resolve));

    client = createClient(TEST_PORT);

    const runRequestWithInternalServerError = async () => {
      const mockHeaders = { 'apns-someheader': 'somevalue' };
      const mockNotification = {
        headers: mockHeaders,
        body: MOCK_BODY,
      };
      const method = HTTP2_METHOD_POST;
      const path = PATH_DEVICE;
      const result = await client.writeV2(method, path, mockNotification);
      // Should not happen, but if it does, the promise should resolve with an error
      expect(result.method).to.equal(method);
      expect(result.path).to.equal(path);
      expect(
        result.error.message.startsWith(
          'Unexpected error processing APNs response: Unexpected token'
        )
      ).to.equal(true);
    };
    await runRequestWithInternalServerError();
    await runRequestWithInternalServerError();
    expect(establishedConnections).to.equal(1); // Currently reuses the connection.
  });

  it('Handles APNs timeouts', async () => {
    let didGetRequest = false;
    let didGetResponse = false;
    server = createAndStartMockServer(TEST_PORT, (req, res, requestBody) => {
      didGetRequest = true;
      setTimeout(() => {
        res.writeHead(200);
        res.end('');
        didGetResponse = true;
      }, 1900);
    });
    client = createClient(TEST_PORT);

    const onListeningPromise = new Promise(resolve => server.on('listening', resolve));
    await onListeningPromise;

    const mockHeaders = { 'apns-someheader': 'somevalue' };
    const mockNotification = {
      headers: mockHeaders,
      body: MOCK_BODY,
    };
    const performRequestExpectingTimeout = async () => {
      const method = HTTP2_METHOD_POST;
      const path = PATH_DEVICE;
      const result = await client.writeV2(method, path, mockNotification);
      expect(result).to.deep.equal({
        method: method,
        path: path,
        error: new VError('apn write timeout'),
      });
      expect(didGetRequest).to.be.true;
      expect(didGetResponse).to.be.false;
    };
    await performRequestExpectingTimeout();
    didGetResponse = false;
    didGetRequest = false;
    // Should be able to have multiple in flight requests all get notified that the server is shutting down
    await Promise.all([
      performRequestExpectingTimeout(),
      performRequestExpectingTimeout(),
      performRequestExpectingTimeout(),
      performRequestExpectingTimeout(),
    ]);
  });

  it('Handles goaway frames', async () => {
    let didGetRequest = false;
    let establishedConnections = 0;
    const method = HTTP2_METHOD_POST;
    const path = PATH_DEVICE;
    server = createAndStartMockLowLevelServer(TEST_PORT, stream => {
      const { session } = stream;
      const errorCode = 1;
      didGetRequest = true;
      session.goaway(errorCode);
    });
    server.on('connection', () => (establishedConnections += 1));
    client = createClient(TEST_PORT);

    const onListeningPromise = new Promise(resolve => server.on('listening', resolve));
    await onListeningPromise;

    const mockHeaders = { 'apns-someheader': 'somevalue' };
    const mockNotification = {
      headers: mockHeaders,
      body: MOCK_BODY,
    };
    const performRequestExpectingGoAway = async () => {
      const result = await client.writeV2(method, path, mockNotification);
      expect(result.method).to.equal(method);
      expect(result.path).to.equal(path);
      expect(result.error).to.be.an.instanceof(VError);
      expect(didGetRequest).to.be.true;
      didGetRequest = false;
    };
    await performRequestExpectingGoAway();
    await performRequestExpectingGoAway();
    expect(establishedConnections).to.equal(2);
  });

  it('Handles unexpected protocol errors (no response sent)', async () => {
    let didGetRequest = false;
    let establishedConnections = 0;
    let responseTimeout = 0;
    server = createAndStartMockLowLevelServer(TEST_PORT, stream => {
      setTimeout(() => {
        const { session } = stream;
        didGetRequest = true;
        if (session) {
          session.destroy();
        }
      }, responseTimeout);
    });
    server.on('connection', () => (establishedConnections += 1));
    client = createClient(TEST_PORT);

    const onListeningPromise = new Promise(resolve => server.on('listening', resolve));
    await onListeningPromise;

    const mockHeaders = { 'apns-someheader': 'somevalue' };
    const mockNotification = {
      headers: mockHeaders,
      body: MOCK_BODY,
    };
    const performRequestExpectingDisconnect = async () => {
      const method = HTTP2_METHOD_POST;
      const path = PATH_DEVICE;
      const result = await client.writeV2(method, path, mockNotification);
      expect(result).to.deep.equal({
        method: method,
        path: path,
        error: new VError('stream ended unexpectedly with status null and empty body'),
      });
      expect(didGetRequest).to.be.true;
    };
    await performRequestExpectingDisconnect();
    didGetRequest = false;
    await performRequestExpectingDisconnect();
    didGetRequest = false;
    expect(establishedConnections).to.equal(2);
    responseTimeout = 10;
    await Promise.all([
      performRequestExpectingDisconnect(),
      performRequestExpectingDisconnect(),
      performRequestExpectingDisconnect(),
      performRequestExpectingDisconnect(),
    ]);
    expect(establishedConnections).to.equal(3);
  });

  it('Establishes a connection through a proxy server', async () => {
    let didRequest = false;
    let establishedConnections = 0;
    let requestsServed = 0;
    const method = HTTP2_METHOD_POST;
    const path = PATH_DEVICE;

    server = createAndStartMockServer(TEST_PORT, (req, res, requestBody) => {
      expect(req.headers).to.deep.equal({
        ':authority': '127.0.0.1',
        ':method': method,
        ':path': path,
        ':scheme': 'https',
        'apns-someheader': 'somevalue',
      });
      expect(requestBody).to.equal(MOCK_BODY);
      // res.setHeader('X-Foo', 'bar');
      // res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.writeHead(200);
      res.end('');
      requestsServed += 1;
      didRequest = true;
    });
    server.on('connection', () => (establishedConnections += 1));
    await new Promise(resolve => server.once('listening', resolve));

    // Proxy forwards all connections to TEST_PORT
    const proxy = net.createServer(clientSocket => {
      clientSocket.once('data', () => {
        const serverSocket = net.createConnection(TEST_PORT, () => {
          clientSocket.write('HTTP/1.1 200 OK\r\n\r\n');
          clientSocket.pipe(serverSocket);
          setTimeout(() => {
            serverSocket.pipe(clientSocket);
          }, 1);
        });
      });
      clientSocket.on('error', () => {});
    });
    await new Promise(resolve => proxy.listen(3128, resolve));

    // Client configured with a port that the server is not listening on
    client = createClient(TEST_PORT + 1);
    // So without adding a proxy config request will fail with a network error
    client.config.proxy = { host: '127.0.0.1', port: 3128 };
    const runSuccessfulRequest = async () => {
      const mockHeaders = { 'apns-someheader': 'somevalue' };
      const mockNotification = {
        headers: mockHeaders,
        body: MOCK_BODY,
      };
      const result = await client.writeV2(method, path, mockNotification);
      expect(result).to.deep.equal({ method, path });
      expect(didRequest).to.be.true;
    };
    expect(establishedConnections).to.equal(0); // should not establish a connection until it's needed
    // Validate that when multiple valid requests arrive concurrently,
    // only one HTTP/2 connection gets established
    await Promise.all([
      runSuccessfulRequest(),
      runSuccessfulRequest(),
      runSuccessfulRequest(),
      runSuccessfulRequest(),
      runSuccessfulRequest(),
    ]);
    didRequest = false;
    await runSuccessfulRequest();
    expect(establishedConnections).to.equal(1); // should establish a connection to the server and reuse it
    expect(requestsServed).to.equal(6);

    proxy.close();
  });

  describe('write', () => {});

  describe('shutdown', () => {});
});
