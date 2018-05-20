/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import { ContainerModule, interfaces } from 'inversify';
import { DebugCommandHandlers } from "./debug-command";
import { DebugConfigurationManager } from './debug-configuration';
import {
    DebugViewContribution,
    DebugWidget,
    DEBUG_FACTORY_ID,
} from './view/debug-view-contribution';
import { DebugPath, DebugService } from "../common/debug-model";
import { MenuContribution } from "@theia/core/lib/common/menu";
import { CommandContribution } from "@theia/core/lib/common/command";
import {
    WidgetFactory,
    bindViewContribution,
    WebSocketConnectionProvider
} from '@theia/core/lib/browser';
import { DebugSessionManager, DebugSessionFactory } from './debug-session';

import '../../src/browser/style/index.css';

export default new ContainerModule((bind: interfaces.Bind, unbind: interfaces.Unbind, isBound: interfaces.IsBound, rebind: interfaces.Rebind) => {
    bind(DebugWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(context => ({
        id: DEBUG_FACTORY_ID,
        createWidget: () => context.container.get<DebugWidget>(DebugWidget)
    })).inSingletonScope();
    bindViewContribution(bind, DebugViewContribution);

    bind(DebugSessionFactory).toSelf().inSingletonScope();
    bind(DebugSessionManager).toSelf().inSingletonScope();
    bind(MenuContribution).to(DebugCommandHandlers);
    bind(CommandContribution).to(DebugCommandHandlers);
    bind(DebugConfigurationManager).toSelf().inSingletonScope();
    bind(DebugService).toDynamicValue(context => WebSocketConnectionProvider.createProxy(context.container, DebugPath)).inSingletonScope();
});
