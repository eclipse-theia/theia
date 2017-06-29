/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

// @ts-check
require('reflect-metadata');
const path = require('path');
const express = require('express');
const { Container, injectable } = require("inversify");

const { BackendApplication, backendApplicationModule, loggerBackendModule } = require("theia-core/lib/application/node");
const { messagingBackendModule } = require("theia-core/lib/messaging/node");

const fileSystemBackendModule = require("theia-core/lib/filesystem/node/filesystem-backend-module").default;
const workspaceBackendModule = require("theia-core/lib/workspace/node/workspace-backend-module").default;
const terminalBackendModule = require('theia-core/lib/terminal/node/terminal-backend-module').default;
const languagesBackendModule = require('theia-core/lib/languages/node/languages-backend-module').default;
const javaBackendModule = require('theia-core/lib/java/node/java-backend-module').default;
const pythonBackendModule = require('theia-core/lib/python/node/python-backend-module').default;
const cppBackendModule = require('theia-core/lib/cpp/node/cpp-backend-module').default;

const container = new Container();
container.load(backendApplicationModule);
container.load(messagingBackendModule);
container.load(loggerBackendModule);

container.load(fileSystemBackendModule);
container.load(workspaceBackendModule);
container.load(languagesBackendModule);
container.load(terminalBackendModule);
container.load(javaBackendModule);
container.load(pythonBackendModule);
container.load(cppBackendModule);

const application = container.get(BackendApplication);
application.use(express.static(path.join(__dirname, '../../lib'), {
    index: 'index.html'
}));
application.start();
