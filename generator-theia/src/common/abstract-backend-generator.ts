/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { AbstractGenerator, FileSystem } from "../common";

export abstract class AbstractBackendGenerator extends AbstractGenerator {

    protected doGenerate(fs: FileSystem, backendModules: Map<string, string>): void {
        fs.write(this.backend('main.js'), this.compileMainJs(backendModules));
    }

    protected compileMainJs(backendModules: Map<string, string>): string {
        return `${this.compileCopyright()}
// @ts-check
require('reflect-metadata');
const path = require('path');
const express = require('express');
const { Container, injectable } = require('inversify');

const { BackendApplication } = require('@theia/core/lib/node');
const { backendApplicationModule } = require('@theia/core/lib/node/backend-application-module');
const { messagingBackendModule } = require('@theia/core/lib/node/messaging/messaging-backend-module');
const { loggerBackendModule } = require('@theia/core/lib/node/logger-backend-module');

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

Promise.resolve()${this.compileBackendModuleImports(backendModules)}
.then(start);`;
    }

}