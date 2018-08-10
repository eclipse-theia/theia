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

import { ContainerModule, interfaces } from 'inversify';
import { CommandContribution, MenuContribution } from '@theia/core/lib/common';
import { WebSocketConnectionProvider, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { FileDialogFactory, createFileDialog, FileDialogProps } from '@theia/filesystem/lib/browser';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { LabelProviderContribution } from '@theia/core/lib/browser/label-provider';
import { VariableContribution } from '@theia/variable-resolver/lib/browser';
import { WorkspaceServer, workspacePath } from '../common';
import { WorkspaceFrontendContribution } from './workspace-frontend-contribution';
import { WorkspaceService } from './workspace-service';
import { WorkspaceCommandContribution, FileMenuContribution } from './workspace-commands';
import { WorkspaceVariableContribution } from './workspace-variable-contribution';
import { WorkspaceStorageService } from './workspace-storage-service';
import { WorkspaceUriLabelProviderContribution } from './workspace-uri-contribution';
import { bindWorkspacePreferences } from './workspace-preferences';
import { QuickOpenWorkspace } from './quick-open-workspace';
import { WorkspaceDeleteHandler } from './workspace-delete-handler';

export default new ContainerModule((bind: interfaces.Bind, unbind: interfaces.Unbind, isBound: interfaces.IsBound, rebind: interfaces.Rebind) => {
    bindWorkspacePreferences(bind);

    bind(WorkspaceService).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toDynamicValue(ctx => ctx.container.get(WorkspaceService));
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
    bind(WorkspaceDeleteHandler).toSelf().inSingletonScope();

    bind(WorkspaceStorageService).toSelf().inSingletonScope();
    rebind(StorageService).toService(WorkspaceStorageService);

    bind(LabelProviderContribution).to(WorkspaceUriLabelProviderContribution).inSingletonScope();
    bind(VariableContribution).to(WorkspaceVariableContribution).inSingletonScope();

    bind(QuickOpenWorkspace).toSelf().inSingletonScope();
});
