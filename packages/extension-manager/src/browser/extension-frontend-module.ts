/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import { FrontendApplicationContribution, WebSocketConnectionProvider } from '@theia/core/lib/browser';
import { ExtensionServer, extensionPath } from '../common/extension-protocol';
import { ExtensionManager } from '../common';
import { ExtensionContribution } from './extension-contribution';
import { ExtensionWidget } from './extension-widget';
import { ExtensionDetailWidgetService } from './extension-detail-widget-service';

import '../../src/browser/style/index.css';

export default new ContainerModule(bind => {
    bind(ExtensionServer).toDynamicValue(ctx => {
        const provider = ctx.container.get(WebSocketConnectionProvider);
        return provider.createProxy<ExtensionServer>(extensionPath);
    }).inSingletonScope();
    bind(ExtensionManager).toSelf().inSingletonScope();

    bind(FrontendApplicationContribution).to(ExtensionContribution).inSingletonScope();
    bind(ExtensionDetailWidgetService).toSelf().inSingletonScope();
    bind(ExtensionWidget).toSelf().inSingletonScope();
});
