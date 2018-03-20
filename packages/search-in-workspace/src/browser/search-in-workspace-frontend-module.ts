/*
 * Copyright (C) 2017-2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, interfaces } from "inversify";
import { SearchInWorkspaceService, SearchInWorkspaceClientImpl } from './search-in-workspace-service';
import { SearchInWorkspaceServer } from '../common/search-in-workspace-interface';
import { WebSocketConnectionProvider, KeybindingContribution, WidgetFactory, createTreeContainer, TreeWidget } from '@theia/core/lib/browser';
import { CommandContribution, MenuContribution, ResourceResolver } from "@theia/core";
import { SearchInWorkspaceWidget } from "./search-in-workspace-widget";
import { SearchInWorkspaceResultTreeWidget } from "./search-in-workspace-result-tree-widget";
import { SearchInWorkspaceFrontendContribution } from "./search-in-workspace-frontend-contribution";
import { InMemoryTextResourceResolver } from "./in-memory-text-resource";

import "../../src/browser/styles/index.css";

export default new ContainerModule(bind => {
    bind(SearchInWorkspaceWidget).toSelf();
    bind<WidgetFactory>(WidgetFactory).toDynamicValue(ctx => ({
        id: SearchInWorkspaceWidget.ID,
        createWidget: () => ctx.container.get(SearchInWorkspaceWidget)
    }));
    bind(SearchInWorkspaceResultTreeWidget).toDynamicValue(ctx => createSearchTreeWidget(ctx.container));

    bind(SearchInWorkspaceFrontendContribution).toSelf().inSingletonScope();
    for (const identifier of [CommandContribution, MenuContribution, KeybindingContribution]) {
        bind(identifier).toService(SearchInWorkspaceFrontendContribution);
    }

    // The object that gets notified of search results.
    bind(SearchInWorkspaceClientImpl).toSelf().inSingletonScope();

    bind(SearchInWorkspaceService).toSelf().inSingletonScope();

    // The object to call methods on the backend.
    bind(SearchInWorkspaceServer).toDynamicValue(ctx => {
        const client = ctx.container.get(SearchInWorkspaceClientImpl);
        return WebSocketConnectionProvider.createProxy(ctx.container, '/search-in-workspace', client);
    }).inSingletonScope();

    bind(InMemoryTextResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(InMemoryTextResourceResolver);
});

export function createSearchTreeWidget(parent: interfaces.Container): SearchInWorkspaceResultTreeWidget {
    const child = createTreeContainer(parent);

    child.unbind(TreeWidget);
    child.bind(SearchInWorkspaceResultTreeWidget).toSelf();

    return child.get(SearchInWorkspaceResultTreeWidget);
}
