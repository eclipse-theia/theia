// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
import { CommandContribution } from '@theia/core';
import { ContainerModule } from '@theia/core/shared/inversify';
import { LlamafileCommandContribution, NewLlamafileConfigQuickInputProvider } from './llamafile-command-contribution';
import { bindViewContribution, WidgetFactory } from '@theia/core/lib/browser';
import { LlamafileViewContribution } from './llamafile-view-contribution';
import { LlamafileListWidget } from './llamafile-list-widget';
import { LlamafileServerManager, LlamafileServerManagerPath } from '../common/llamafile-server-manager';
import { RemoteConnectionProvider, ServiceConnectionProvider } from '@theia/core/lib/browser/messaging/service-connection-provider';

export default new ContainerModule(bind => {
    bind(NewLlamafileConfigQuickInputProvider).toSelf().inSingletonScope();
    bind(LlamafileListWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(context => ({
        id: LlamafileListWidget.ID,
        createWidget: () => context.container.get<LlamafileListWidget>(LlamafileListWidget),
    })).inSingletonScope();
    bind(CommandContribution).to(LlamafileCommandContribution).inSingletonScope();
    bindViewContribution(bind, LlamafileViewContribution);
    bind(LlamafileServerManager).toDynamicValue(ctx => {
        const connection = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        return connection.createProxy<LlamafileServerManager>(LlamafileServerManagerPath);
    });
});
