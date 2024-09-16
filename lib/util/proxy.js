const http = require('http');
const getEnv = require('./getEnv');

module.exports = {
  /**
   * Connects to proxy and returns the socket
   *
   * @param {Object} proxy - Proxy connection object containing host, port, username and passord
   * @param {Object} target - Proxy target containing host and port
   * @returns {Socket} - HTTP socket
   */
  createProxySocket: function (proxy, target) {
    return new Promise((resolve, reject) => {
      const proxyRequestOptions = {
        host: proxy.host,
        port: proxy.port,
        method: 'CONNECT',
        path: `${target.host || ''}${target.port ? `:${target.port}` : ''}`,
        headers: { Connection: 'Keep-Alive' },
      };

      // Add proxy basic authentication header
      if (proxy.username || proxy.password) {
        const auth = `${proxy.username || ''}:${proxy.password || ''}`;
        const base64 = Buffer.from(auth, 'utf8').toString('base64');

        proxyRequestOptions.headers['Proxy-Authorization'] = 'Basic ' + base64;
      }

      const req = http.request(proxyRequestOptions);
      req.on('error', reject);
      req.on('connect', (res, socket, head) => resolve(socket));
      req.end();
    });
  },

  /**
   * Get proxy connection info from the system environment variables
   * Gathers connection info from environment variables in the following order:
   *   1. apn_proxy
   *   2. npm_config_http/https_proxy (https if targetPort: 443)
   *   3. http/https_proxy (https if targetPort: 443)
   *   4. all_proxy
   *   5. npm_config_proxy
   *   6. proxy
   *
   * @param {number} targetPort - Port number for the target host/webpage.
   * @returns {Object} proxy - Object containing proxy information from the environment.
   * @returns {string} proxy.host - Proxy hostname
   * @returns {string} proxy.origin - Proxy port number
   * @returns {string} proxy.port - Proxy port number
   * @returns {string} proxy.protocol - Proxy connection protocol
   * @returns {string} proxy.username - Username for connecting to the proxy
   * @returns {string} proxy.password - Password for connecting to the proxy
   */
  getSystemProxy: function (targetPort) {
    const protocol = targetPort === 443 ? 'https' : 'http';
    let proxy =
      getEnv('apn_proxy') ||
      getEnv(`npm_config_${protocol}_proxy`) ||
      getEnv(`${protocol}_proxy`) ||
      getEnv('all_proxy') ||
      getEnv('npm_config_proxy') ||
      getEnv('proxy');

    // No proxy environment variable set
    if (!proxy) return null;

    // Append protocol scheme if missing from proxy url
    if (proxy.indexOf('://') === -1) {
      proxy = `${protocol}://${proxy}`;
    }

    // Parse proxy as Url to easier extract info
    const parsedProxy = new URL(proxy);
    return {
      host: parsedProxy.hostname || parsedProxy.host,
      origin: parsedProxy.origin,
      port: parsedProxy.port,
      protocol: parsedProxy.protocol,
      username: parsedProxy.username,
      password: parsedProxy.password,
    };
  },

  /**
   * Checks the `no_proxy` environment variable if a hostname (and port) should be proxied or not.
   *
   * @param {string} hostname - Hostname of the page we are connecting to (not the proxy itself)
   * @param {string} port - Effective port number for the host
   * @returns {boolean} Whether the hostname should be proxied or not
   */
  shouldProxyHost: function (hostname, port) {
    const noProxy = `${getEnv('no_proxy') || getEnv('npm_config_no_proxy')}`.toLowerCase();
    if (!noProxy || noProxy === '*') return true; // No proxy restrictions are set or everything should be proxied

    // Loop all excluded paths and check if host matches
    return noProxy.split(/[,\s]+/).every(function (path) {
      if (!path) return true;

      // Parse path to separate host and port
      const match = path.match(/^([^:]+)?(?::(\d+))?$/);
      const proxyHost = match[1] || '';
      const proxyPort = match[2] ? parseInt(match[2]) : '';

      // If port is specified and it doesn't match
      if (proxyPort && proxyPort !== port) return true;

      // No hostname, but matching port is specified
      if (proxyPort && !proxyHost) return false;

      // If no wildcards or beginning with dot, return if exact match
      if (!/^[.*]/.test(proxyHost)) {
        if (hostname === proxyHost) return false;
      }

      // Escape any special characters in the hostname
      const escapedProxyHost = proxyHost.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

      // Replace wildcard characters in the hostname with regular expression wildcards
      const regexProxyHost = escapedProxyHost
        .replace(/^\\\./, '\\*.') // Leading dot = wildcard
        .replace(/\\\.$/, '\\*.') // Trailing dot = wildcard
        .replace(/\\\*/g, '.*');

      // Test the hostname against the regular expression
      return !new RegExp(`^${regexProxyHost}$`).test(hostname);
    });
  },
};
