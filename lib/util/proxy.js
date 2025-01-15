const http = require('http');

module.exports = function createProxySocket(proxy, target) {
  return new Promise((resolve, reject) => {
    let headers = { Connection: "Keep-Alive" };
    if (proxy.user && proxy.pass) {
      const token = Buffer.from(`${proxy.user}:${proxy.pass}`).toString('base64')
      headers["Proxy-Authorization"] = `Basic ${token}`
    }

    const req = http.request({
      host: proxy.host,
      port: proxy.port,
      method: "connect",
      path: target.host + ":" + target.port,
      headers: headers,
    });
    req.on('error', reject);
    req.on('connect', (res, socket, head) => {
      resolve(socket);
    });
    req.end();
  });
};
