/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Container } from 'inversify';
import { FrontendApplication, frontendApplicationModule, loggerFrontendModule } from 'theia-core/lib/application/browser';
import { messagingFrontendModule } from 'theia-core/lib/messaging/browser';

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

Promise.resolve()
.then(function () { return import('theia-core/lib/application/electron-browser/menu/electron-menu-module').then(load) })
.then(function () { return import('theia-core/lib/application/electron-browser/clipboard/electron-clipboard-module').then(load) })
.then(function () { return import('theia-core/lib/filesystem/browser/filesystem-frontend-module').then(load) })
.then(function () { return import('theia-core/lib/workspace/browser/workspace-frontend-module').then(load) })
.then(function () { return import('theia-core/lib/navigator/browser/navigator-frontend-module').then(load) })
.then(function () { return import('theia-core/lib/terminal/browser/terminal-frontend-module').then(load) })
.then(function () { return import('theia-core/lib/editor/browser/editor-frontend-module').then(load) })
.then(function () { return import('theia-core/lib/monaco/electron-browser/monaco-electron-module').then(load) })
.then(function () { return import('theia-core/lib/languages/browser/languages-frontend-module').then(load) })
.then(function () { return import('theia-core/lib/java/browser/java-frontend-module').then(load) })
.then(function () { return import('theia-core/lib/python/browser/python-frontend-module').then(load) })
.then(function () { return import('theia-core/lib/cpp/browser/cpp-frontend-module').then(load) })
.then(start);