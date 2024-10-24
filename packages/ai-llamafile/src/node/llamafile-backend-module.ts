// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { LlamafileManagerImpl } from './llamafile-manager-impl';
import { LlamafileManager, LlamafileServerManagerClient, LlamafileManagerPath } from '../common/llamafile-manager';
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core';

export default new ContainerModule(bind => {
    bind(LlamafileManager).to(LlamafileManagerImpl).inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx => new RpcConnectionHandler<LlamafileServerManagerClient>(
        LlamafileManagerPath,
        client => {
            const service = ctx.container.get<LlamafileManager>(LlamafileManager);
            service.setClient(client);
            return service;
        }
    )).inSingletonScope();
});
