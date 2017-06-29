/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, } from 'inversify';
import { ConnectionHandler, JsonRpcConnectionHandler } from '../../messaging/common';
import { IPreferenceServer, IPreferenceClient } from '../common/preference-protocol'
import { WorkspaceServer } from '../../workspace/common';
import { DefaultPreferenceServer } from '../node/default-preference-server'
import { CompoundPreferenceServer } from '../common/compound-preference-server'
import { JsonPreferenceServer, WorkspacePreferenceServer, UserPreferenceServer, PreferencePath } from './json-preference-server'
import { FileUri } from "../../application/node/file-uri";

import * as path from 'path';
import * as os from 'os';

export const preferenceServerModule = new ContainerModule(bind => {
    bind(DefaultPreferenceServer).toSelf().inSingletonScope();
    bind(JsonPreferenceServer).toSelf();

    // Workspace preference server that watches the current workspace
    bind(WorkspacePreferenceServer).toDynamicValue(ctx => {
        const workspaceServer = ctx.container.get<WorkspaceServer>(WorkspaceServer);
        const preferencePath = workspaceServer.getRoot().then(root => {
            return FileUri.create(root).resolve(path.join('.theia', 'prefs.json'));
        })

        const child = ctx.container.createChild();
        child.bind(PreferencePath).toConstantValue(preferencePath);

        return child.get(JsonPreferenceServer);
    });

    // User preference server that watches the home directory of the user
    bind(UserPreferenceServer).toDynamicValue(ctx => {
        const uri = Promise.resolve(FileUri.create(os.homedir()).resolve(path.join('.theia', 'prefs.json')));

        const child = ctx.container.createChild();
        child.bind(PreferencePath).toConstantValue(uri);

        return child.get(JsonPreferenceServer);
    });

    // Preference server that merges the default with the different json servers
    bind(IPreferenceServer).toDynamicValue(ctx => {
        const defaultServer = ctx.container.get(DefaultPreferenceServer);
        const userServer = ctx.container.get<IPreferenceServer>(UserPreferenceServer);
        const workspaceServer = ctx.container.get<IPreferenceServer>(WorkspacePreferenceServer);
        return new CompoundPreferenceServer(workspaceServer, userServer, defaultServer);

    }).inSingletonScope();

    bind(ConnectionHandler).toDynamicValue(ctx => {
        let clients: IPreferenceClient[] = []
        const prefServer = ctx.container.get<IPreferenceServer>(IPreferenceServer);

        prefServer.setClient({
            onDidChangePreference(pref) {
                for (const client of clients) {
                    client.onDidChangePreference(pref)
                }
            }
        })

        return new JsonRpcConnectionHandler<IPreferenceClient>("preferences", client => {
            clients.push(client);
            client.onDidCloseConnection(() => {
                clients = clients.filter(e => e !== client)
            })
            return prefServer;

        })
    }).inSingletonScope()
});