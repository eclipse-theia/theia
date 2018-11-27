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

import { ContainerModule, Container } from 'inversify';
import { RawProcess, RawProcessOptions, RawProcessFactory, RawForkOptions } from './raw-process';
import { TerminalProcess, TerminalProcessOptions, TerminalProcessFactory } from './terminal-process';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { ProcessManager } from './process-manager';
import { ILogger } from '@theia/core/lib/common';
import { MultiRingBuffer, MultiRingBufferOptions } from './multi-ring-buffer';

export default new ContainerModule(bind => {
    bind(RawProcess).toSelf().inTransientScope();
    bind(ProcessManager).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(ProcessManager);
    bind(ILogger).toDynamicValue(ctx => {
        const parentLogger = ctx.container.get<ILogger>(ILogger);
        return parentLogger.child('process');
    }).inSingletonScope().whenTargetNamed('process');
    bind(RawProcessFactory).toFactory(ctx =>
        (options: RawProcessOptions | RawForkOptions) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;

            child.bind(RawProcessOptions).toConstantValue(options);
            return child.get(RawProcess);
        }
    );

    bind(TerminalProcess).toSelf().inTransientScope();
    bind(TerminalProcessFactory).toFactory(ctx =>
        (options: TerminalProcessOptions) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;

            child.bind(TerminalProcessOptions).toConstantValue(options);
            return child.get(TerminalProcess);
        }
    );

    bind(MultiRingBuffer).toSelf().inTransientScope();
    /* 1MB size, TODO should be a user preference. */
    bind(MultiRingBufferOptions).toConstantValue({ size: 1048576 });
});
