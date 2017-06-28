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
${this.compileModuleImports(this.model.frontendModules)}

const container = new Container();
container.load(frontendApplicationModule);
container.load(messagingFrontendModule);
container.load(loggerFrontendModule);
${this.compileModuleLoading(this.model.frontendModules)}

const application = container.get(FrontendApplication);
application.start();`;
    }

}