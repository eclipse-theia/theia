/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { Emitter, Event } from '@theia/core/lib/common/event';
import { IBaseTerminalClient, IBaseTerminalExitEvent, IBaseTerminalErrorEvent } from './base-terminal-protocol';

@injectable()
export class TerminalWatcher {

    getTerminalClient(): IBaseTerminalClient {
        const exitEmitter = this.onTerminalExitEmitter;
        const errorEmitter = this.onTerminalErrorEmitter;
        return {
            onTerminalExitChanged(event: IBaseTerminalExitEvent) {
                exitEmitter.fire(event);
            },
            onTerminalError(event: IBaseTerminalErrorEvent) {
                errorEmitter.fire(event);
            }
        };
    }

    private onTerminalExitEmitter = new Emitter<IBaseTerminalExitEvent>();
    private onTerminalErrorEmitter = new Emitter<IBaseTerminalErrorEvent>();

    get onTerminalExit(): Event<IBaseTerminalExitEvent> {
        return this.onTerminalExitEmitter.event;
    }

    get onTerminalError(): Event<IBaseTerminalErrorEvent> {
        return this.onTerminalErrorEmitter.event;
    }
}
