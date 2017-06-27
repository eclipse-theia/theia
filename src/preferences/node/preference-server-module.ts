/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, } from 'inversify';
import { ConnectionHandler, JsonRpcConnectionHandler } from '../../messaging/common';
import { IPreferenceServer, IPreferenceClient } from '../common/preference-protocol'
import { DefaultPreferenceServer } from '../node/default-preference-server'
import { CompoundPreferenceServer } from '../common/compound-preference-server'
import { JsonPreferenceServer, PreferencePath } from './json-preference-server'
import { FileUri } from "../../application/node/file-uri";

import * as path from 'path';

export const preferenceServerModule = new ContainerModule(bind => {
    const WorkspacePreferenceServer = Symbol('WorkspacePreferenceServer');
    const UserPreferenceServer = Symbol('UserPreferenceServer');

    bind(DefaultPreferenceServer).toSelf().inSingletonScope();

    bind(WorkspacePreferenceServer).to(JsonPreferenceServer).inSingletonScope();
    bind(UserPreferenceServer).to(JsonPreferenceServer).inSingletonScope();

    bind(PreferencePath).toConstantValue(FileUri.create(path.resolve('.theia', 'prefs.json')));
    bind(IPreferenceServer).toDynamicValue(ctx => {
        const defaultServer = ctx.container.get(DefaultPreferenceServer);
        const userServer = ctx.container.get<IPreferenceServer>(UserPreferenceServer);
        const workspaceServer = ctx.container.get<IPreferenceServer>(WorkspacePreferenceServer);
        return new CompoundPreferenceServer(defaultServer, userServer, workspaceServer);

    }).inSingletonScope();

    bind(ConnectionHandler).toDynamicValue(ctx => {
        let clients: IPreferenceClient[] = []
        const prefServer = ctx.container.get<IPreferenceServer>(IPreferenceServer);

        prefServer.setClient({
            onDidChangePreference(pref) {
                for (let client of clients) {
                    client.onDidChangePreference(pref)
                }
            }
        })

        return new JsonRpcConnectionHandler<IPreferenceClient>("preferences", client => {
            const prefServer = ctx.container.get(IPreferenceServer);
            return prefServer;
        })
    }).inSingletonScope()
});