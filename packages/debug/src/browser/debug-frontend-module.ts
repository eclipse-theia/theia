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
import { DebugCommandHandlers, DEBUG_SESSION_CONTEXT_MENU } from "./debug-command";
import { DebugConfigurationManager } from './debug-configuration';
import {
    DebugViewContribution,
    DebugTreeWidgetFactory,
    DebugTreeWidget,
    DebugWidgetFactory,
} from './view/debug-view-contribution';
import { DebugPath, DebugService } from "../common/debug-model";
import { MenuContribution } from "@theia/core/lib/common/menu";
import { CommandContribution } from "@theia/core/lib/common/command";
import { WebSocketConnectionProvider } from "@theia/core/lib/browser/messaging/connection";
import {
    FrontendApplicationContribution,
    createTreeContainer,
    TreeWidget,
    WidgetFactory,
    KeybindingContribution,
    TreeProps,
    defaultTreeProps
} from '@theia/core/lib/browser';
import { DebugSessionManager, DebugSessionFactory } from './debug-session';

export const DEBUG_SESSION_TREE_PROPS = <TreeProps>{
    ...defaultTreeProps,
    contextMenuPath: DEBUG_SESSION_CONTEXT_MENU,
    multiSelect: false
};

export default new ContainerModule((bind: interfaces.Bind, unbind: interfaces.Unbind, isBound: interfaces.IsBound, rebind: interfaces.Rebind) => {
    bind(DebugViewContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toDynamicValue(c => c.container.get(DebugViewContribution));
    bind(MenuContribution).toDynamicValue(c => c.container.get(DebugViewContribution));
    bind(CommandContribution).toDynamicValue(c => c.container.get(DebugViewContribution));
    bind(KeybindingContribution).toDynamicValue(c => c.container.get(DebugViewContribution));
    bind(DebugWidgetFactory).toSelf().inSingletonScope();
    bind(WidgetFactory).toDynamicValue(context => context.container.get(DebugWidgetFactory));

    bind(DebugTreeWidgetFactory).toFactory(ctx =>
        () => createDebugTreeWidget(ctx.container)
    );

    bind(DebugSessionFactory).toSelf().inSingletonScope();
    bind(DebugSessionManager).toSelf().inSingletonScope();
    bind(MenuContribution).to(DebugCommandHandlers);
    bind(CommandContribution).to(DebugCommandHandlers);
    bind(DebugConfigurationManager).toSelf().inSingletonScope();
    bind(DebugService).toDynamicValue(context => WebSocketConnectionProvider.createProxy(context.container, DebugPath)).inSingletonScope();
});

function createDebugTreeWidget(parent: interfaces.Container): DebugTreeWidget {
    const child = createTreeContainer(parent);
    child.unbind(TreeWidget);
    child.bind(DebugTreeWidget).toSelf();
    child.rebind(TreeProps).toConstantValue(DEBUG_SESSION_TREE_PROPS);
    return child.get(DebugTreeWidget);
}
