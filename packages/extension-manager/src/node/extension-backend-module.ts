/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as yargs from "yargs";
import { ContainerModule, interfaces } from "inversify";
import { ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core';
import { ExtensionServer, extensionPath } from "../common/extension-protocol";
import { NodeExtensionServer } from './node-extension-server';
import { AppProject, AppProjectOptions } from './app-project';

export function bindNodeExtensionServer(bind: interfaces.Bind, options: AppProjectOptions): void {
    bind(AppProjectOptions).toConstantValue(options);
    bind(AppProject).toSelf().inSingletonScope();

    bind(NodeExtensionServer).toSelf().inSingletonScope();
    bind(ExtensionServer).toDynamicValue(ctx =>
        ctx.container.get(NodeExtensionServer)
    ).inSingletonScope();
}

const appProjectPath = 'app-project-path';
const appTarget = 'app-target';
const appNpmClient = 'app-npm-client';
const appAutoBuild = 'app-auto-build';
const argv = yargs
    .default(appProjectPath, process.cwd())
    .default(appTarget, 'browser')
    .default(appNpmClient, 'yarn')
    .default(appAutoBuild, true)
    .argv;

export default new ContainerModule(bind => {
    bindNodeExtensionServer(bind, {
        path: argv[appProjectPath],
        target: argv[appTarget],
        npmClient: argv[appNpmClient],
        autoInstall: argv[appAutoBuild]
    });

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler(extensionPath, () =>
            ctx.container.get(ExtensionServer)
        )
    ).inSingletonScope();
});