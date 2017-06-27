/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, } from 'inversify';
import { IPreferenceServer } from '../common/preference-server'
import { WebSocketConnectionProvider } from '../../messaging/browser/connection';


export const preferenceClientModule = new ContainerModule(bind => {
    bind(IPreferenceServer).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        const prefServiceClient = ctx.container.get(IPreferenceServer);
        return connection.createProxy<IPreferenceServer>("/preferences", prefServiceClient);
    }).inSingletonScope();
});

