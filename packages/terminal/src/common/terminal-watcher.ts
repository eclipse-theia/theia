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

import { injectable } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common/event';
import {
    IBaseTerminalClient,
    IBaseTerminalExitEvent,
    IBaseTerminalErrorEvent
} from './base-terminal-protocol';

@injectable()
export class TerminalWatcher {

    getTerminalClient(): IBaseTerminalClient {
        const exitEmitter = this.onTerminalExitEmitter;
        const errorEmitter = this.onTerminalErrorEmitter;
        const storeTerminalEnvVariablesEmitter = this.onStoreTerminalEnvVariablesRequestedEmitter;
        const updateTerminalEnvVariablesEmitter = this.onUpdateTerminalEnvVariablesRequestedEmitter;
        return {
            storeTerminalEnvVariables(data: string): void {
                storeTerminalEnvVariablesEmitter.fire(data);
            },
            updateTerminalEnvVariables(): void {
                updateTerminalEnvVariablesEmitter.fire(undefined);
            },
            onTerminalExitChanged(event: IBaseTerminalExitEvent): void {
                exitEmitter.fire(event);
            },
            onTerminalError(event: IBaseTerminalErrorEvent): void {
                errorEmitter.fire(event);
            }
        };
    }

    private onTerminalExitEmitter = new Emitter<IBaseTerminalExitEvent>();
    private onTerminalErrorEmitter = new Emitter<IBaseTerminalErrorEvent>();
    private onStoreTerminalEnvVariablesRequestedEmitter = new Emitter<string>();
    private onUpdateTerminalEnvVariablesRequestedEmitter = new Emitter<undefined>();

    get onTerminalExit(): Event<IBaseTerminalExitEvent> {
        return this.onTerminalExitEmitter.event;
    }

    get onTerminalError(): Event<IBaseTerminalErrorEvent> {
        return this.onTerminalErrorEmitter.event;
    }

    get onStoreTerminalEnvVariablesRequested(): Event<string> {
        return this.onStoreTerminalEnvVariablesRequestedEmitter.event;
    }

    get onUpdateTerminalEnvVariablesRequested(): Event<undefined> {
        return this.onUpdateTerminalEnvVariablesRequestedEmitter.event;
    }
}
