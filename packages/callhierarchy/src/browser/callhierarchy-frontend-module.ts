/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { CallHierarchyContribution } from './callhierarchy-contribution';
import { CommandContribution, MenuContribution, bindContributionProvider } from "@theia/core/lib/common";
import { CallHierarchyService, CallHierarchyServiceProvider } from "./callhierarchy-service";
import { WidgetFactory, KeybindingContribution } from '@theia/core/lib/browser';
import { CALLHIERARCHY_ID } from './callhierarchy';
import { createHierarchyTreeWidget } from './callhierarchy-tree';
import { CurrentEditorAccess } from './current-editor-access';

import { ContainerModule } from "inversify";

import '../../src/browser/style/index.css';

export default new ContainerModule(bind => {
    bind(CurrentEditorAccess).toSelf().inSingletonScope();

    bindContributionProvider(bind, CallHierarchyService);
    bind(CallHierarchyServiceProvider).to(CallHierarchyServiceProvider).inSingletonScope();

    bind(CallHierarchyContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toDynamicValue(ctx => ctx.container.get(CallHierarchyContribution));
    bind(MenuContribution).toDynamicValue(ctx => ctx.container.get(CallHierarchyContribution));
    bind(KeybindingContribution).toDynamicValue(ctx => ctx.container.get(CallHierarchyContribution));

    bind(WidgetFactory).toDynamicValue(context => ({
        id: CALLHIERARCHY_ID,
        createWidget: () => createHierarchyTreeWidget(context.container)
    }));
});
