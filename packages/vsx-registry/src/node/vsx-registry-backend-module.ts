// *****************************************************************************
// Copyright (C) 2020 TypeFox and others.
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

import { ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core';
import { CliContribution } from '@theia/core/lib/node';
import { ContainerModule } from '@theia/core/shared/inversify';
import { PluginDeployerParticipant, PluginDeployerResolver } from '@theia/plugin-ext/lib/common/plugin-protocol';
import { VSXEnvironment, VSX_ENVIRONMENT_PATH } from '../common/vsx-environment';
import { VsxCli } from './vsx-cli';
import { VSXEnvironmentImpl } from './vsx-environment-impl';
import { VSXExtensionResolver } from './vsx-extension-resolver';
import { VsxCliDeployerParticipant } from './vsx-cli-deployer-participant';

export default new ContainerModule(bind => {
    bind(VSXEnvironment).to(VSXEnvironmentImpl).inSingletonScope();
    bind(VsxCli).toSelf().inSingletonScope();
    bind(CliContribution).toService(VsxCli);
    bind(ConnectionHandler)
        .toDynamicValue(ctx => new JsonRpcConnectionHandler(VSX_ENVIRONMENT_PATH, () => ctx.container.get(VSXEnvironment)))
        .inSingletonScope();
    bind(VSXExtensionResolver).toSelf().inSingletonScope();
    bind(PluginDeployerResolver).toService(VSXExtensionResolver);
    bind(VsxCliDeployerParticipant).toSelf().inSingletonScope();
    bind(PluginDeployerParticipant).toService(VsxCliDeployerParticipant);
});
