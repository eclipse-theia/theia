/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

require('reflect-metadata');
const path = require('path');
const express = require('express');
const { Container, injectable } = require('inversify');

const { BackendApplication, backendApplicationModule, loggerBackendModule } = require('theia-core/lib/application/node');
const { messagingBackendModule } = require("theia-core/lib/messaging/node");

const container = new Container();
container.load(backendApplicationModule);
container.load(messagingBackendModule);
container.load(loggerBackendModule);

function load(raw) {
    return Promise.resolve(raw.default).then(module =>
        container.load(module)
    )
}

function start() {
    const application = container.get(BackendApplication);
    application.use(express.static(path.join(__dirname, '../../lib'), {
        index: 'index.html'
    }));
    application.start();
}

Promise.resolve()
.then(function () { return Promise.resolve(require('theia-core/lib/filesystem/node/filesystem-backend-module')).then(load) })
.then(function () { return Promise.resolve(require('theia-core/lib/workspace/node/workspace-backend-module')).then(load) })
.then(function () { return Promise.resolve(require('theia-core/lib/terminal/node/terminal-backend-module')).then(load) })
.then(function () { return Promise.resolve(require('theia-core/lib/languages/node/languages-backend-module')).then(load) })
.then(function () { return Promise.resolve(require('theia-core/lib/java/node/java-backend-module')).then(load) })
.then(function () { return Promise.resolve(require('theia-core/lib/python/node/python-backend-module')).then(load) })
.then(function () { return Promise.resolve(require('theia-core/lib/cpp/node/cpp-backend-module')).then(load) })
.then(start);