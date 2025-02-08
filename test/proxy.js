const VError = require('verror');
const createProxySocket = require('../lib/util/proxy');

describe('Proxy Server', async () => {
  it('can throw errors', async () => {
    let receivedError;
    try {
      await createProxySocket(
        {
          host: '127.0.0.1',
          port: 3311,
        },
        {
          host: '127.0.0.1',
          port: 'NOT_A_PORT',
        }
      );
    } catch (e) {
      receivedError = e;
    }
    expect(receivedError).to.exist;
    expect(receivedError.error).to.be.an.instanceof(VError);
    expect(receivedError.error.message).to.have.string('cannot connect to proxy server');
  });
});
