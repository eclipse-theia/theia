/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, } from 'inversify';
import { ConnectionHandler } from '../../messaging/common';
import { JsonRpcProxyFactory } from '../../messaging/common/proxy-factory';
import { JsonPreferenceService, IPreferenceServer, PreferencePath } from '../common/preference-server'
import { IPreferenceClient } from '../common/preference-service'

export const preferenceServerModule = new ContainerModule(bind => {
    bind(IPreferenceServer).to(JsonPreferenceService).inSingletonScope();
    bind(PreferencePath).toConstantValue(".theia/prefs.json");

    bind<ConnectionHandler>(ConnectionHandler).toDynamicValue(ctx => {
        let clients: IPreferenceClient[] = [
            // Not sure what to have here...
        ]
        const prefService = <JsonPreferenceService>ctx.container.get(IPreferenceServer);

        prefService.setClient({
            onDidChangePreference(pref) {
                for (let client of clients) {
                    client.onDidChangePreference(pref)
                }
            }
        })
        return {
            path: "/preferences",
            onConnection(connection) {
                const proxyFactory = new JsonRpcProxyFactory<IPreferenceClient>("/preferences", prefService)
                proxyFactory.onConnection(connection)
                const client = proxyFactory.createProxy()
                clients.push(client)
                connection.onDispose(() => {
                    clients = clients.filter(e => e !== client)
                })
            }
        }
    })
});