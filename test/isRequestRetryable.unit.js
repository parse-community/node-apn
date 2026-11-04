const { expect } = require('chai');
const Client = require('../lib/client')({
  logger: { enabled: false, log: () => {} },
  errorLogger: { enabled: false, log: () => {} },
  config: () => ({}),
  http2: { constants: {} },
});

describe('Client.isRequestRetryable', () => {
  it('returns true for error.message starting with "apn write failed"', () => {
    const error = { error: { message: 'apn write failed: socket hang up' } };
    expect(Client.isRequestRetryable(error)).to.be.true;
  });

  it('returns false for error.message starting with "apn write timeout" (not retryable)', () => {
    const error = { error: { message: 'apn write timeout: timed out' } };
    expect(Client.isRequestRetryable(error)).to.be.false;
  });

  it('returns false for error.message starting with "apn write aborted" (not retryable)', () => {
    const error = { error: { message: 'apn write aborted: aborted' } };
    expect(Client.isRequestRetryable(error)).to.be.false;
  });

  it('returns false for error.message with other apn messages', () => {
    const error = { error: { message: 'apn connection closed' } };
    expect(Client.isRequestRetryable(error)).to.be.false;
  });

  it('returns false for null error.error', () => {
    const error = { error: null };
    expect(Client.isRequestRetryable(error)).to.be.false;
  });

  it('returns false for undefined error.error', () => {
    const error = {};
    expect(Client.isRequestRetryable(error)).to.be.false;
  });

  it('returns false for error.error.message not matching', () => {
    const error = { error: { message: 'some other error' } };
    expect(Client.isRequestRetryable(error)).to.be.false;
  });

  it('returns true for retryable status codes', () => {
    [408, 429, 500, 502, 503, 504].forEach(status => {
      expect(Client.isRequestRetryable({ status })).to.be.true;
    });
  });

  it('returns true for ExpiredProviderToken', () => {
    const error = { status: 403, error: { message: 'ExpiredProviderToken' } };
    expect(Client.isRequestRetryable(error)).to.be.true;
  });

  it('returns false for non-retryable status codes', () => {
    [200, 201, 400, 404, 401, 403].forEach(status => {
      expect(Client.isRequestRetryable({ status })).to.be.false;
    });
  });
});
