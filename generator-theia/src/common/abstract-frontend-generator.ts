/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { AbstractGenerator, FileSystem } from "../common";

export abstract class AbstractFrontendGenerator extends AbstractGenerator {

    protected doGenerate(fs: FileSystem, frontendModules: Map<string, string>): void {
        fs.write(this.frontend('index.html'), this.compileIndexHtml(frontendModules))
        fs.write(this.frontend('index.js'), this.compileIndexJs(frontendModules));
    }

    protected compileIndexHtml(frontendModules: Map<string, string>): string {
        return `<!DOCTYPE html>
<html>

<head>${this.compileIndexHead(frontendModules)}
  <script type="text/javascript" src="./bundle.js" charset="utf-8"></script>
</head>

<body>
</body>

</html>`;
    }

    protected compileIndexHead(frontendModules: Map<string, string>): string {
        return `
  <meta charset="UTF-8">
  <link href="http://maxcdn.bootstrapcdn.com/font-awesome/4.2.0/css/font-awesome.min.css" rel="stylesheet">
  <script type="text/javascript" src="https://www.promisejs.org/polyfills/promise-6.1.0.js" charset="utf-8"></script>`
    }

    protected compileIndexJs(frontendModules: Map<string, string>): string {
        return `${this.compileCopyright()}
// @ts-check
import { Container } from 'inversify';
import { FrontendApplication } from '@theia/core/lib/browser';
import { frontendApplicationModule } from '@theia/core/lib/browser/frontend-application-module';
import { messagingFrontendModule } from '@theia/core/lib/browser/messaging/messaging-frontend-module';
import { loggerFrontendModule } from '@theia/core/lib/browser/logger-frontend-module';

const container = new Container();
container.load(frontendApplicationModule);
container.load(messagingFrontendModule);
container.load(loggerFrontendModule);

function load(raw) {
    return Promise.resolve(raw.default).then(module =>
        container.load(module)
    )
}

function start() {
    const application = container.get(FrontendApplication);
    application.start();
}

Promise.resolve()${this.compileFrontendModuleImports(frontendModules)}
.then(start);`;
    }

}