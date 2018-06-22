/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
    bind(WidgetFactory).toDynamicValue(ctx => ctx.container.get(ExtensionWidgetFactory)).inSingletonScope();

    bind(ExtensionOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toDynamicValue(ctx => ctx.container.get(ExtensionOpenHandler)).inSingletonScope();
});
