// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

import { ContainerModule, interfaces } from '@theia/core/shared/inversify';
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core/lib/common';
import { isWindows, isOSX } from '@theia/core/lib/common/os';
import { ExternalTerminalService, externalTerminalServicePath } from '../common/external-terminal.js';
import { MacExternalTerminalService } from './mac-external-terminal-service.js';
import { LinuxExternalTerminalService } from './linux-external-terminal-service.js';
import { WindowsExternalTerminalService } from './windows-external-terminal-service.js';

export function bindExternalTerminalService(bind: interfaces.Bind): void {
    const serviceProvider: interfaces.ServiceIdentifier<ExternalTerminalService> =
        isWindows ? WindowsExternalTerminalService : isOSX ? MacExternalTerminalService : LinuxExternalTerminalService;
    bind(serviceProvider).toSelf().inSingletonScope();
    bind(ExternalTerminalService).toService(serviceProvider);

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler(externalTerminalServicePath, () =>
            ctx.container.get(ExternalTerminalService)
        )
    ).inSingletonScope();
}

export default new ContainerModule(bind => {
    bindExternalTerminalService(bind);
});
