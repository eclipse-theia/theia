/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as os from 'os';
import { ContainerModule } from 'inversify';
import { bindContributionProvider } from '../../application/common';
import { FileUri } from '../../application/node';
import { ConnectionHandler, JsonRpcConnectionHandler } from '../../messaging/common';
import { WorkspaceServer } from '../../workspace/common';
import { CompoundPreferenceServer, PreferenceClient, PreferenceServer, preferencesPath } from '../common';
import { DefaultPreferenceServer, PreferenceContribution } from './default-preference-server';
import { JsonPreferenceServer, PreferencePath } from './json-preference-server';

/*
 * Workspace preference server that watches the current workspace
 */
export const WorkspacePreferenceServer = Symbol('WorkspacePreferenceServer');
export type WorkspacePreferenceServer = PreferenceServer;

/*
 * User preference server that watches the home directory of the user
 */
export const UserPreferenceServer = Symbol('UserPreferenceServer');
export type UserPreferenceServer = PreferenceServer;

export default new ContainerModule(bind => {
    bindContributionProvider(bind, PreferenceContribution);
    bind(DefaultPreferenceServer).toSelf().inSingletonScope();
    bind(JsonPreferenceServer).toSelf();

    bind(UserPreferenceServer).toDynamicValue(ctx => {
        const homeUri = FileUri.create(os.homedir());
        const uri = homeUri.withPath(homeUri.path.join('.theia', 'settings.json'));

        const child = ctx.container.createChild();
        child.bind(PreferencePath).toConstantValue(uri);
        return child.get(JsonPreferenceServer);
    }).inSingletonScope();

    bind(WorkspacePreferenceServer).toDynamicValue(ctx => {
        const workspaceServer = ctx.container.get<WorkspaceServer>(WorkspaceServer);
        const preferencePath = workspaceServer.getRoot().then(root => {
            const rootUri = FileUri.create(root);
            return rootUri.withPath(rootUri.path.join('.theia', 'settings.json'));
        });

        const child = ctx.container.createChild();
        child.bind(PreferencePath).toConstantValue(preferencePath);
        return child.get(JsonPreferenceServer);
    });

    bind(PreferenceServer).toDynamicValue(ctx => {
        const defaultServer = ctx.container.get(DefaultPreferenceServer);
        const userServer = ctx.container.get<UserPreferenceServer>(UserPreferenceServer);
        const workspaceServer = ctx.container.get<WorkspacePreferenceServer>(WorkspacePreferenceServer);
        return new CompoundPreferenceServer(workspaceServer, userServer, defaultServer);
    });

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<PreferenceClient>(preferencesPath, client => {
            const server = ctx.container.get<PreferenceServer>(PreferenceServer);
            server.setClient(client);
            client.onDidCloseConnection(() => server.dispose());
            return server;
        })
    ).inSingletonScope();
});