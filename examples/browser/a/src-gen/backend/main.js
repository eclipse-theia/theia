// @ts-check
const { BackendApplicationConfigProvider } = require('@theia/core/lib/node/backend-application-config-provider');
const main = require('@theia/core/lib/node/main');
BackendApplicationConfigProvider.set({});

const serverModule = require('./server');
const address = main.start(serverModule());
address.then(function (address) {
    if (process && process.send) {
        process.send(address.port.toString());
    }
});
module.exports = address;
