const extend = require('./util/extend');

const EndpointAddress = {
  production: 'api.push.apple.com',
  development: 'api.sandbox.push.apple.com',
};

const ManageChannelsEndpointAddress = {
  production: 'api-manage-broadcast.push.apple.com',
  development: 'api-manage-broadcast.sandbox.push.apple.com',
};

module.exports = function (dependencies) {
  const logger = dependencies.logger;
  const prepareCertificate = dependencies.prepareCertificate;
  const prepareToken = dependencies.prepareToken;
  const prepareCA = dependencies.prepareCA;

  function config(options) {
    const config = {
      token: null,
      cert: 'cert.pem',
      key: 'key.pem',
      ca: null,
      pfx: null,
      passphrase: null,
      production: process.env.NODE_ENV === 'production',
      address: null,
      port: 443,
      manageChannelsAddress: null,
      manageChannelsPort: null,
      proxy: null,
      manageChannelsProxy: null,
      rejectUnauthorized: true,
      connectionRetryLimit: 3,
      heartBeat: 60000,
      requestTimeout: 5000,
    };

    validateOptions(options);

    extend(config, options);
    configureAddress(config);
    configureManageChannelsAddress(config);

    if (config.token) {
      delete config.cert;
      delete config.key;
      delete config.pfx;

      extend(config, { token: prepareToken(config.token) });
    } else {
      if (config.pfx || config.pfxData) {
        config.cert = options.cert;
        config.key = options.key;
      }
      extend(config, prepareCertificate(config));
    }

    extend(config, prepareCA(config));

    return config;
  }

  function validateOptions(options) {
    for (const key in options) {
      if (options[key] === null || options[key] === undefined) {
        logger(
          'Option [' + key + '] is ' + options[key] + '. This may cause unexpected behaviour.'
        );
      }
    }

    if (options) {
      if (options.passphrase && typeof options.passphrase !== 'string') {
        throw new Error('Passphrase must be a string');
      }

      if (options.token) {
        validateToken(options.token);
      }
    }
  }

  return config;
};

function validateToken(token) {
  if (!token.keyId) {
    throw new Error('token.keyId is missing');
  } else if (typeof token.keyId !== 'string') {
    throw new Error('token.keyId must be a string');
  }

  if (!token.teamId) {
    throw new Error('token.teamId is missing');
  } else if (typeof token.teamId !== 'string') {
    throw new Error('token.teamId must be a string');
  }
}

function configureAddress(options) {
  if (!options.address) {
    if (options.production) {
      options.address = EndpointAddress.production;
    } else {
      options.address = EndpointAddress.development;
    }
  } else {
    if (options.address === EndpointAddress.production) {
      options.production = true;
    } else {
      options.production = false;
    }
  }
}

function configureManageChannelsAddress(options) {
  if (!options.manageChannelsAddress) {
    if (options.production) {
      options.manageChannelsAddress = ManageChannelsEndpointAddress.production;
    } else {
      options.manageChannelsAddress = ManageChannelsEndpointAddress.development;
    }
  }
  configureManageChannelsPort(options);
}

function configureManageChannelsPort(options) {
  if (!options.manageChannelsPort) {
    if (options.production) {
      options.manageChannelsPort = 2196;
    } else {
      options.manageChannelsPort = 2195;
    }
  }
}
