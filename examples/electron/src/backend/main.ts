/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'reflect-metadata';
import * as path from 'path';
import { Container, injectable } from "inversify";
import * as express from 'express';
import { BackendApplication, BackendApplicationContribution, applicationModule } from "theia/lib/application/node";
import { fileSystemServerModule } from "theia/lib/filesystem/node";
import { messagingModule } from "theia/lib/messaging/node";
import { nodeLanguagesModule } from 'theia/lib/languages/node';
import { nodeJavaModule } from 'theia/lib/java/node';
import { nodePythonModule } from 'theia/lib/languages/python/node/node-python-module';
import terminalBackendModule from 'theia/lib/terminal/node/terminal-backend-module'

// FIXME introduce default error handler contribution
process.on('uncaughtException', function (err: any) {
    console.error('Uncaught Exception: ', err.toString());
    if (err.stack) {
        console.error(err.stack);
    }
});

@injectable()
class StaticServer implements BackendApplicationContribution {
    configure(app: express.Application): void {
        app.use(express.static(path.join(__dirname, '..'), {
            index: path.join('frontend', 'index.html')
        }));
    }
}

const container = new Container();
container.load(applicationModule);
container.load(messagingModule);
container.load(fileSystemServerModule);
container.load(nodeLanguagesModule);
container.load(terminalBackendModule);
container.load(nodeJavaModule);
container.load(nodePythonModule);
container.bind(BackendApplicationContribution).to(StaticServer);
const application = container.get(BackendApplication);
application.start();
