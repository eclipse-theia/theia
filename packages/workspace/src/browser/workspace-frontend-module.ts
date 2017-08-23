/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from "inversify";
import { CommandContribution, MenuContribution } from "@theia/core/lib/common";
import { WebSocketConnectionProvider } from '@theia/core/lib/browser';
import { FileDialogFactory, createFileDialog, FileDialogProps } from '@theia/filesystem/lib/browser';
import { WorkspaceServer, workspacePath } from '../common';
import { WorkspaceFrontendContribution } from "./workspace-frontend-contribution";
import { WorkspaceService } from './workspace-service';
import { WorkspaceCommandContribution, FileMenuContribution } from './workspace-commands';

export default new ContainerModule(bind => {
    bind(WorkspaceService).toSelf().inSingletonScope();
    bind(WorkspaceServer).toDynamicValue(ctx => {
        const provider = ctx.container.get(WebSocketConnectionProvider);
        return provider.createProxy<WorkspaceServer>(workspacePath);
    }).inSingletonScope();

    bind(WorkspaceFrontendContribution).toSelf().inSingletonScope();
    for (const identifier of [CommandContribution, MenuContribution]) {
        bind(identifier).toDynamicValue(ctx =>
            ctx.container.get(WorkspaceFrontendContribution)
        ).inSingletonScope();
    }

    bind(FileDialogFactory).toFactory(ctx =>
        (props: FileDialogProps) =>
            createFileDialog(ctx.container, props)
    );
    bind(CommandContribution).to(WorkspaceCommandContribution).inSingletonScope();
    bind(MenuContribution).to(FileMenuContribution).inSingletonScope();
});