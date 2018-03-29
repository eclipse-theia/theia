/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, Container } from 'inversify';
import { RawProcess, RawProcessOptions, RawProcessFactory } from './raw-process';
import { TerminalProcess, TerminalProcessOptions, TerminalProcessFactory } from './terminal-process';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { ProcessManager } from "./process-manager";
import { ILogger } from '@theia/core/lib/common';
import { MultiRingBuffer, MultiRingBufferOptions } from './multi-ring-buffer';

export default new ContainerModule(bind => {
    bind(RawProcess).toSelf().inTransientScope();
    bind(ProcessManager).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toDynamicValue(ctx => ctx.container.get(ProcessManager)).inSingletonScope();
    bind(ILogger).toDynamicValue(ctx => {
        const parentLogger = ctx.container.get<ILogger>(ILogger);
        return parentLogger.child({ 'module': 'process' });
    }).inSingletonScope().whenTargetNamed('process');
    bind(RawProcessFactory).toFactory(ctx =>
        (options: RawProcessOptions) => {
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
