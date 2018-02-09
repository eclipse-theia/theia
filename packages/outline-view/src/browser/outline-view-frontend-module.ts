/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, interfaces } from 'inversify';
import { OutlineViewService } from './outline-view-service';
import { OutlineViewContribution } from './outline-view-contribution';
import { WidgetFactory } from '@theia/core/lib/browser/widget-manager';
import { FrontendApplicationContribution, createTreeContainer, TreeWidget } from '@theia/core/lib/browser';
import { OutlineViewWidgetFactory, OutlineViewWidget } from './outline-view-widget';
import { CommandContribution } from '@theia/core/lib/common/command';
import { KeybindingContribution } from '@theia/core/lib/browser/keybinding';
import { MenuContribution } from '@theia/core/lib/common/menu';

export default new ContainerModule(bind => {
    bind(OutlineViewWidgetFactory).toFactory(ctx =>
        () => createOutlineViewWidget(ctx.container)
    );

    bind(OutlineViewService).toSelf().inSingletonScope();
    bind(WidgetFactory).toDynamicValue(context => context.container.get(OutlineViewService));

    bind(OutlineViewContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toDynamicValue(c => c.container.get(OutlineViewContribution));
    bind(CommandContribution).toDynamicValue(c => c.container.get(OutlineViewContribution));
    bind(KeybindingContribution).toDynamicValue(c => c.container.get(OutlineViewContribution));
    bind(MenuContribution).toDynamicValue(c => c.container.get(OutlineViewContribution));
});

function createOutlineViewWidget(parent: interfaces.Container): OutlineViewWidget {
    const child = createTreeContainer(parent);

    child.unbind(TreeWidget);
    child.bind(OutlineViewWidget).toSelf();

    return child.get(OutlineViewWidget);
}
