/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as os from 'os';

export class BrowserBackendGenerator {
    generate(options: {
        frontendModules: { [moduleName: string]: string }
        backendModules: { [moduleName: string]: string }
    }): string {
        const { backendModules } = options;
        return `${this.generateCopyright()}

import 'reflect-metadata';
import * as path from 'path';
import * as yargs from 'yargs';
import * as express from 'express';
import { Container, injectable } from "inversify";

import { BackendApplication, BackendApplicationContribution, applicationModule } from "theia-core/lib/application/node";
import { messagingBackendModule } from "theia-core/lib/messaging/node";
import { loggerBackendModule } from 'theia-core/lib/application/node';
${Object.keys(backendModules).map(moduleName => `import { ${moduleName} } from "${backendModules[moduleName]}"`).join(os.EOL)}

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

yargs.usage(\`Usage main.js [--loglevel='trace','debug','info','warn','error','fatal']\`)
    .default('loglevel', 'info')
    .describe('loglevel', 'Sets the log level')
    .help()
    .argv;

const container = new Container();
container.load(applicationModule);
container.load(messagingBackendModule);
container.load(loggerBackendModule);

${Object.keys(backendModules).map(moduleName => `container.load(${moduleName});`).join(os.EOL)}

container.bind(BackendApplicationContribution).to(StaticServer);
const application = container.get(BackendApplication);
application.start();`;
    }

    protected generateCopyright(): string {
        return `/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */`;
    }
}