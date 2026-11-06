// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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

import { ContainerModule } from 'inversify';
import { FrontendApplicationContribution } from '../../browser/frontend-application-contribution.js';
import { WebSocketConnectionProvider } from '../../browser/messaging/ws-connection-provider.js';
import { ShellEnvironmentServer, shellEnvironmentPath } from '../../common/shell-environment.js';
import { ElectronShellEnvironmentContribution } from './electron-shell-environment-contribution.js';

export default new ContainerModule(bind => {
    bind(ShellEnvironmentServer).toDynamicValue(ctx =>
        WebSocketConnectionProvider.createProxy<ShellEnvironmentServer>(ctx.container, shellEnvironmentPath)
    ).inSingletonScope();
    bind(ElectronShellEnvironmentContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ElectronShellEnvironmentContribution);
});
