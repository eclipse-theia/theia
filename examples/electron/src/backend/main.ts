/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'reflect-metadata';
import * as path from 'path';
import * as express from 'express';
import { Container, injectable } from "inversify";

import { BackendApplication, BackendApplicationContribution, backendApplicationModule } from "theia-core/lib/application/node";
import { messagingBackendModule } from "theia-core/lib/messaging/node";
import { loggerBackendModule } from 'theia-core/lib/application/node';

import fileSystemBackendModule from "theia-core/lib/filesystem/node/filesystem-backend-module";
import workspaceBackendModule from "theia-core/lib/workspace/node/workspace-backend-module";
import terminalBackendModule from 'theia-core/lib/terminal/node/terminal-backend-module';
import languagesBackendModule from 'theia-core/lib/languages/node/languages-backend-module';
import javaBackendModule from 'theia-core/lib/java/node/java-backend-module';
import pythonBackendModule from 'theia-core/lib/python/node/python-backend-module';
import cppBackendModule from 'theia-core/lib/cpp/node/cpp-backend-module';

@injectable()
class StaticServer implements BackendApplicationContribution {
    configure(app: express.Application): void {
        app.use(express.static(path.join(__dirname, '..'), {
            index: path.join('frontend', 'index.html')
        }));
    }
}

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

container.bind(BackendApplicationContribution).to(StaticServer);
const application = container.get(BackendApplication);
application.start();
