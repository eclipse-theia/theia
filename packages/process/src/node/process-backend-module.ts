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

import { ContainerModule } from 'inversify';
import { RawProcessFactory, RawProcessFactoryImpl } from './raw-process';
import { TerminalProcessFactory, TerminalProcessFactoryImpl } from './terminal-process';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { ProcessManager } from './process-manager';
import { ILogger } from '@theia/core/lib/common';

export default new ContainerModule(bind => {
    bind(ProcessManager).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toDynamicValue(ctx => ctx.container.get(ProcessManager)).inSingletonScope();
    bind(ILogger).toDynamicValue(ctx => {
        const parentLogger = ctx.container.get<ILogger>(ILogger);
        return parentLogger.child('process');
    }).inSingletonScope().whenTargetNamed('process');

    bind(RawProcessFactory).to(RawProcessFactoryImpl);
    bind(TerminalProcessFactory).to(TerminalProcessFactoryImpl);
});
