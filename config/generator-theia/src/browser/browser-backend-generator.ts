/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { AbstractGenerator, FileSystem } from "./abstract-generator";

export class BrowserBackendGenerator extends AbstractGenerator {

    generate(fs: FileSystem): void {
        fs.write('src/backend/main.ts', this.compileBackendMain());
    }

    protected compileBackendMain(): string {
        return `${this.compileCopyright()}

import 'reflect-metadata';
import * as path from 'path';
import * as express from 'express';
import { Container, injectable } from 'inversify';

import { BackendApplication, BackendApplicationContribution, backendApplicationModule } from 'theia-core/lib/application/node';
import { messagingBackendModule } from 'theia-core/lib/messaging/node';
import { loggerBackendModule } from 'theia-core/lib/application/node';
${this.compileModuleImports(this.model.backendModules)}

@injectable()
class StaticServer implements BackendApplicationContribution {
    configure(app: express.Application): void {
        app.use(express.static(path.join(__dirname, '..'), {
            index: path.join('frontend', 'index.html')
        }));
    }
}

// Create the app container and load the common contributions.
const container = new Container();
container.load(backendApplicationModule);
container.load(messagingBackendModule);
container.load(loggerBackendModule);
${this.compileModuleLoading('Load the backend contributions.', this.model.backendModules)}

// Obtain the application and start.
container.bind(BackendApplicationContribution).to(StaticServer);
const application = container.get(BackendApplication);
application.start();`;
    }

}