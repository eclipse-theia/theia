/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { Emitter, Event } from '../common';
import { ILoggerClient, ILogLevelChangedEvent } from '../common/logger-protocol';

@injectable()
export class LoggerWatcher {

    getLoggerClient(): ILoggerClient {
        const emitter = this.onLogLevelChangedEmitter
        return {
            onLogLevelChanged(event: ILogLevelChangedEvent) {
                emitter.fire(event)
            }
        }
    }

    private onLogLevelChangedEmitter = new Emitter<ILogLevelChangedEvent>();

    get onLogLevelChanged(): Event<ILogLevelChangedEvent> {
        return this.onLogLevelChangedEmitter.event;
    }
}