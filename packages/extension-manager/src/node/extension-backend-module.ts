/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as yargs from 'yargs';
import { ContainerModule, interfaces } from "inversify";
import { ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core';
import { ExtensionServer, ExtensionClient, extensionPath } from "../common/extension-protocol";
import { NodeExtensionServer } from './node-extension-server';
import { AppProject, AppProjectOptions } from './app-project';
import { NpmClient, NpmClientOptions } from './npm-client';
import { AppProjectInstallerOptions, AppProjectInstaller, AppProjectInstallerFactory } from './app-project-installer';

export type AppProjectArgs = AppProjectOptions & NpmClientOptions;
export function bindNodeExtensionServer(bind: interfaces.Bind, args: AppProjectArgs): void {
    bind(NpmClientOptions).toConstantValue(args);
    bind(NpmClient).toSelf().inSingletonScope();

    bind(AppProjectInstallerFactory).toFactory(context =>
        (options: AppProjectInstallerOptions) => {
            const child = context.container.createChild();
            child.bind(AppProjectInstaller).toSelf().inSingletonScope();
            child.bind(AppProjectInstallerOptions).toConstantValue(options);
            return child.get(AppProjectInstaller);
        }
    );

    bind(AppProjectOptions).toConstantValue(args);
    bind(AppProject).toSelf().inSingletonScope();

    bind(NodeExtensionServer).toSelf();
    bind(ExtensionServer).toDynamicValue(ctx =>
        ctx.container.get(NodeExtensionServer)
    );
}

const appProjectPath = 'app-project-path';
const appTarget = 'app-target';
const appNpmClient = 'app-npm-client';
const appNoAutoInstall = 'app-no-auto-install';
const argv = yargs
    .default(appProjectPath, process.cwd())
    .default(appTarget, 'browser')
    .default(appNpmClient, 'yarn')
    .argv;

export default new ContainerModule(bind => {
    bindNodeExtensionServer(bind, {
        path: argv[appProjectPath],
        target: argv[appTarget],
        npmClient: argv[appNpmClient],
        autoInstall: !argv[appNoAutoInstall]
    });

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<ExtensionClient>(extensionPath, client => {
            const server = ctx.container.get<ExtensionServer>(ExtensionServer);
            server.setClient(client);
            client.onDidCloseConnection(() => server.dispose());
            return server;
        })
    ).inSingletonScope();
});
