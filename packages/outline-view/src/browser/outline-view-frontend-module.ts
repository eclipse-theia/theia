/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import { ContainerModule } from 'inversify';
import { OutlineViewWidget } from './outline-view-widget';
import { OutlineViewService } from './outline-view-service';
import { createOutlineViewWidget } from './outline-view-container';
import { OutlineViewContribution } from './outline-view-contribution';
import { WidgetFactory } from '@theia/core/lib/browser/widget-manager';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';

export default new ContainerModule(bind => {
    bind(OutlineViewService).toSelf().inSingletonScope();

    bind(OutlineViewWidget).toDynamicValue(ctx =>
        createOutlineViewWidget(ctx.container)
    );

    bind(WidgetFactory).toDynamicValue(context => ({
        id: 'outline-view',
        createWidget: () => context.container.get<OutlineViewWidget>(OutlineViewWidget)
    }));

    bind(OutlineViewContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toDynamicValue(c => c.container.get(OutlineViewContribution));
});
