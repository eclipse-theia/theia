require('reflect-metadata');

const { Container, injectable } = require('inversify');
const { MasterDeps } = require('@theia/example-backend/lib/electron-master/deps');
const container = new Container();

function load(raw) {
    return Promise.resolve(raw.default).then(module => {
        container.load(module)
    });
}

function start() {
    container.get(MasterDeps).start();
}

module.exports = () =>
    Promise.resolve()
        .then(function () { return Promise.resolve(require('@theia/example-backend/lib/electron-master')).then(load) })
        .then(start)
        .catch(err => console.error('Error found', err));
