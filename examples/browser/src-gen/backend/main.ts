/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'reflect-metadata';
import * as path from 'path';
import * as express from 'express';
import { Container, injectable } from 'inversify';

import { BackendApplication, BackendApplicationContribution, backendApplicationModule } from 'theia-core/lib/application/node';
import { messagingBackendModule } from 'theia-core/lib/messaging/node';
import { loggerBackendModule } from 'theia-core/lib/application/node';

import backend_1 from 'theia-core/lib/filesystem/node/filesystem-backend-module';
import backend_2 from 'theia-core/lib/workspace/node/workspace-backend-module';
import backend_3 from 'theia-core/lib/terminal/node/terminal-backend-module';
import backend_4 from 'theia-core/lib/languages/node/languages-backend-module';
import backend_5 from 'theia-core/lib/java/node/java-backend-module';
import backend_6 from 'theia-core/lib/python/node/python-backend-module';
import backend_7 from 'theia-core/lib/cpp/node/cpp-backend-module';

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

container.load(backend_1);
container.load(backend_2);
container.load(backend_3);
container.load(backend_4);
container.load(backend_5);
container.load(backend_6);
container.load(backend_7);

container.bind(BackendApplicationContribution).to(StaticServer);
const application = container.get(BackendApplication);
application.start();