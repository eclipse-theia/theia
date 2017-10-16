/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable, inject } from 'inversify';
import { DebugSession } from '@theia/debug/lib/node/debug-session';
import { IMIDebugger } from './mi';
import { DebugSessionManager } from '@theia/debug/lib/node/debug-session-manager';
import { ILogger } from '@theia/core/lib/common';

export interface LaunchRequestArguments {
    target: string;
    debuggerPath: string;
    debuggerArgs: string;
}

@injectable()
export class GDBDebugSession extends DebugSession {

    public readonly id: number;

    public constructor(
        @inject(DebugSessionManager) protected readonly manager: DebugSessionManager,
        @inject(IMIDebugger) protected readonly _debugger: IMIDebugger,
        @inject(ILogger) protected readonly logger: ILogger) {
        super(manager);
        this.logger.debug("New GDB Debug Session");
    }
    public start(options: object) {
        /* FIXME this should obviously not be hardcoded */
        this._debugger.start({ command: 'gdb', args: [] })
            .then((result) => {
            }).catch((error) => {
                this.logger.error(`Error starting debug session ${error.message}`);
            });
    }

    get debugger(): IMIDebugger {
        return this._debugger;
    }
}
