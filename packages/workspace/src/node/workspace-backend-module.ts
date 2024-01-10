// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import { ContainerModule } from '@theia/core/shared/inversify';
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core/lib/common';
import { WorkspaceServer, workspacePath, UntitledWorkspaceService, WorkspaceFileService } from '../common';
import { DefaultWorkspaceServer, WorkspaceCliContribution } from './default-workspace-server';
import { CliContribution } from '@theia/core/lib/node/cli';
import { BackendApplicationContribution } from '@theia/core/lib/node';

export default new ContainerModule(bind => {
    bind(WorkspaceCliContribution).toSelf().inSingletonScope();
    bind(CliContribution).toService(WorkspaceCliContribution);
    bind(DefaultWorkspaceServer).toSelf().inSingletonScope();
    bind(WorkspaceServer).toService(DefaultWorkspaceServer);
    bind(BackendApplicationContribution).toService(WorkspaceServer);
    bind(UntitledWorkspaceService).toSelf().inSingletonScope();
    bind(WorkspaceFileService).toSelf().inSingletonScope();

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler(workspacePath, () =>
            ctx.container.get(WorkspaceServer)
        )
    ).inSingletonScope();
});
