/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { AbstractGenerator, FileSystem } from "./abstract-generator";

export class BrowserFrontendGenerator extends AbstractGenerator {

    generate(fs: FileSystem): void {
        fs.write(this.frontend('index.html'), this.compileIndex());
        fs.write(this.frontend('index.ts'), this.compileMonaco());
        fs.write(this.frontend('main.ts'), this.compileMain());
    }

    protected compileIndex(): string {
        return `<!DOCTYPE html>
<html>

<head>
  <meta charset="UTF-8">
  <link href="http://maxcdn.bootstrapcdn.com/font-awesome/4.2.0/css/font-awesome.min.css" rel="stylesheet">
  <script type="text/javascript" src="https://www.promisejs.org/polyfills/promise-6.1.0.js" charset="utf-8"></script>
  <script type="text/javascript" src="../vs/loader.js" charset="utf-8"></script>
  <script type="text/javascript" src="../bundle.js" charset="utf-8"></script>
</head>

<body>
</body>

</html>`;
    }

    protected compileMonaco(): string {
        return `${this.compileCopyright()}
window.onload = () => {
    const w = <any>window;
    w.require(["vs/editor/editor.main"], () => {
        w.require([
            'vs/basic-languages/src/monaco.contribution',
            'vs/language/css/monaco.contribution',
            'vs/language/typescript/src/monaco.contribution',
            'vs/language/html/monaco.contribution',
            'vs/language/json/monaco.contribution',
            'vs/platform/commands/common/commands',
            'vs/platform/actions/common/actions',
            'vs/platform/keybinding/common/keybindingsRegistry',
            'vs/platform/keybinding/common/keybindingResolver',
            'vs/base/common/keyCodes',
            'vs/editor/browser/standalone/simpleServices'
        ], (basic: any, css: any, ts: any, html: any, json: any, commands: any, actions: any, registry: any, resolver: any,
            keyCodes: any, simpleServices: any) => {

                const global: any = self;
                global.monaco.commands = commands;
                global.monaco.actions = actions;
                global.monaco.keybindings = Object.assign(registry, resolver, keyCodes);
                global.monaco.services = simpleServices;
                require('./main');
            });
    });
};`
    }

    protected compileMain(): string {
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