/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
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

import { ContainerModule } from '@theia/core/shared/inversify';
import { MultiRingBuffer, MultiRingBufferOptions } from './multi-ring-buffer';
import { NodePtyTerminalFactory } from './node-pty-terminal-factory';
import { TerminalBufferFactory } from './terminal-buffer';
import { TerminalFactory } from './terminal-factory';
import { TerminalMultiRingBuffer } from './terminal-multi-ring-buffer';
import { ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core';
import { OsProcessServerPath, OsProcessServer } from '../common/os-process-protocol';

export default new ContainerModule(bind => {
    bind(MultiRingBuffer).toSelf().inTransientScope();
    // 1MB size, TODO should be a user preference.
    bind(MultiRingBufferOptions).toConstantValue({ size: 1048576 });
    bind(TerminalMultiRingBuffer).toSelf().inTransientScope();
    bind(TerminalBufferFactory).toFactory(ctx => () => ctx.container.get(TerminalMultiRingBuffer));
    bind(TerminalFactory).to(NodePtyTerminalFactory).inSingletonScope();
    bind(OsProcessServer).to(OsProcessServerImpl).inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(
        ctx => new JsonRpcConnectionHandler(OsProcessServerPath,
            () => ctx.container.get(OsProcessServer)
        )
    ).inSingletonScope();
});
