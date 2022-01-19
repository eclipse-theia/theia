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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { VSXExtensionResolver } from './vsx-extension-resolver';
import { PluginDeployerResolver } from '@theia/plugin-ext/lib/common/plugin-protocol';
import { OVSXClientProvider, createOVSXClient } from '../common/ovsx-client-provider';
import { VSXEnvironment, VSX_ENVIRONMENT_PATH } from '../common/vsx-environment';
import { VSXEnvironmentImpl } from './vsx-environment-impl';
import { ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core';
import { RequestService } from '@theia/core/shared/@theia/request-service';

export default new ContainerModule(bind => {
    bind<OVSXClientProvider>(OVSXClientProvider).toDynamicValue(ctx => {
        const clientPromise = createOVSXClient(ctx.container.get(VSXEnvironment), ctx.container.get(RequestService));
        return () => clientPromise;
    }).inSingletonScope();
    bind(VSXEnvironment).to(VSXEnvironmentImpl).inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(
        ctx => new JsonRpcConnectionHandler(VSX_ENVIRONMENT_PATH, () => ctx.container.get(VSXEnvironment))
    ).inSingletonScope();
    bind(VSXExtensionResolver).toSelf().inSingletonScope();
    bind(PluginDeployerResolver).toService(VSXExtensionResolver);
});
