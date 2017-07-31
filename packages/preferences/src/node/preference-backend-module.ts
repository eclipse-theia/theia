/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as os from 'os';
import { ContainerModule } from 'inversify';
import URI from "@theia/core/lib/common/uri";
import { FileUri } from '@theia/core/lib/node';
import { ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core/lib/common';
import { WorkspaceServer } from '@theia/workspace/lib/common';
import { PreferenceService, CompoundPreferenceServer, PreferenceClient, PreferenceServer, preferencesPath } from '../common';
import { JsonPreferenceServer, PreferenceUri } from './json-preference-server';
import { PrefJsonValidator } from "../common";
import { JsonPrefSchema } from "../common/json-pref-schema"
import { PrefSchema } from "../common/json-pref-validator"
import { JsonValidator } from "../common/json-validator"

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

    bind(JsonPrefSchema).toSelf().inSingletonScope();
    bind(PrefSchema).toDynamicValue((ctx) => {
        const schema = ctx.container.get<JsonPrefSchema>(JsonPrefSchema);
        return schema.getSchema();
    })

    bind(JsonValidator).to(PrefJsonValidator);
    bind(JsonPreferenceServer).toSelf();

    bind(UserPreferenceServer).toDynamicValue(ctx => {
        const homeUri = FileUri.create(os.homedir());
        const uri = homeUri.withPath(homeUri.path.join('.theia', 'settings.json'));

        const child = ctx.container.createChild();
        child.bind(PreferenceUri).toConstantValue(uri);
        return child.get(JsonPreferenceServer);
    });

    bind(WorkspacePreferenceServer).toDynamicValue(ctx => {
        const workspaceServer = ctx.container.get<WorkspaceServer>(WorkspaceServer);
        const uri = workspaceServer.getRoot().then(root => {
            const rootUri = new URI(root);
            return rootUri.withPath(rootUri.path.join('.theia', 'settings.json'));
        });

        const child = ctx.container.createChild();
        child.bind(PreferenceUri).toConstantValue(uri);
        return child.get(JsonPreferenceServer);
    });

    bind(PreferenceServer).toDynamicValue(ctx => {
        const userServer = ctx.container.get<UserPreferenceServer>(UserPreferenceServer);
        const workspaceServer = ctx.container.get<WorkspacePreferenceServer>(WorkspacePreferenceServer);
        return new CompoundPreferenceServer(workspaceServer, userServer);
    });

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<PreferenceClient>(preferencesPath, client => {
            const server = ctx.container.get<PreferenceServer>(PreferenceServer);
            server.setClient(client);
            client.onDidCloseConnection(() => server.dispose());
            return server;
        })
    ).inSingletonScope();

    bind(PreferenceService).toSelf();
});