const http = require('http');
const VError = require('verror');

module.exports = function createProxySocket(proxy, target) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: proxy.host,
      port: proxy.port,
      method: 'connect',
      path: target.host + ':' + target.port,
      headers: { Connection: 'Keep-Alive' },
    });
    req.on('error', error => {
      const connectionError = new VError(`cannot connect to proxy server: ${error}`);
      const returnedError = { error: connectionError };
      reject(returnedError);
    });
    req.on('connect', (res, socket, head) => {
      resolve(socket);
    });
    req.end();
  });
};
