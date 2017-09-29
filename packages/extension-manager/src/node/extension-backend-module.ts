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
import { ExtensionKeywords, NodeExtensionServer } from './node-extension-server';
import { ApplicationProject, ApplicationProjectOptions } from './application-project';
import { NpmClient, NpmClientOptions } from './npm-client';

export const extensionKeyword = "theia-extension";

export type ApplicationProjectArgs = ApplicationProjectOptions & NpmClientOptions;
export function bindNodeExtensionServer(bind: interfaces.Bind, args: ApplicationProjectArgs): void {
    bind(NpmClientOptions).toConstantValue(args);
    bind(NpmClient).toSelf().inSingletonScope();

    bind(ApplicationProjectOptions).toConstantValue(args);
    bind(ApplicationProject).toSelf().inSingletonScope();

    bind(ExtensionKeywords).toConstantValue([extensionKeyword]);
    bind(NodeExtensionServer).toSelf();
    bind(ExtensionServer).toDynamicValue(ctx =>
        ctx.container.get(NodeExtensionServer)
    );
}

const appProjectPath = 'app-project-path';
const appTarget = 'app-target';
const appNpmClient = 'app-npm-client';
const appAutoInstall = 'app-auto-install';
const argv = yargs
    .default(appProjectPath, process.cwd())
    .default(appTarget, 'browser')
    .default(appNpmClient, 'yarn')
    .default(appAutoInstall, true)
    .argv;

export default new ContainerModule(bind => {
    bindNodeExtensionServer(bind, {
        projectPath: argv[appProjectPath],
        target: argv[appTarget],
        npmClient: argv[appNpmClient],
        autoInstall: argv[appAutoInstall]
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
