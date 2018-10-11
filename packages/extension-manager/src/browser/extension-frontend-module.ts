/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { ContainerModule } from 'inversify';
import {
    WebSocketConnectionProvider, WidgetFactory,
    OpenHandler, bindViewContribution
} from '@theia/core/lib/browser';
import { ExtensionServer, extensionPath } from '../common/extension-protocol';
import { ExtensionManager } from '../common';
import { ExtensionContribution, EXTENSIONS_WIDGET_FACTORY_ID } from './extension-contribution';
import { ExtensionWidget } from './extension-widget';
import { ExtensionWidgetFactory } from './extension-widget-factory';
import { ExtensionOpenHandler } from './extension-open-handler';

import '../../src/browser/style/index.css';

export default new ContainerModule(bind => {
    bind(ExtensionServer).toDynamicValue(ctx => {
        const provider = ctx.container.get(WebSocketConnectionProvider);
        return provider.createProxy<ExtensionServer>(extensionPath);
    }).inSingletonScope();
    bind(ExtensionManager).toSelf().inSingletonScope();

    bindViewContribution(bind, ExtensionContribution);

    bind(ExtensionWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: EXTENSIONS_WIDGET_FACTORY_ID,
        createWidget: () => ctx.container.get(ExtensionWidget)
    }));

    bind(ExtensionWidgetFactory).toSelf().inSingletonScope();
    bind(WidgetFactory).toService(ExtensionWidgetFactory);

    bind(ExtensionOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(ExtensionOpenHandler);
});
