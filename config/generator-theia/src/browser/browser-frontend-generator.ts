/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { AbstractGenerator, FileSystem } from "./abstract-generator";

export class BrowserFrontendGenerator extends AbstractGenerator {

    generate(fs: FileSystem): void {
        fs.write('src/frontend/main.ts', this.compileBackendMain());
    }

    protected compileBackendMain(): string {
        return `${this.compileCopyright()}

import { Container } from 'inversify';
import { FrontendApplication, frontendApplicationModule } from 'theia-core/lib/application/browser';
import { messagingFrontendModule } from 'theia-core/lib/messaging/browser';
import { loggerFrontendModule } from 'theia-core/lib/application/browser';
${this.compileModuleImports(this.model.browserFrontendModules)}
${this.compileModuleImports(this.model.frontendModules)}

// Create the app container and load the common contributions.
const container = new Container();
container.load(frontendApplicationModule);
container.load(messagingFrontendModule);
container.load(loggerFrontendModule);
${this.compileModuleLoading('Load the browser contributions.', this.model.browserFrontendModules)}
${this.compileModuleLoading('Load the frontend contributions.', this.model.frontendModules)}

// Obtain the application and start.
const application = container.get(FrontendApplication);
application.start();`;
    }

}