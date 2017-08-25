/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { Emitter, Event } from '@theia/core/lib/common/event';
import { TaskClient, TaskExitedEvent, TaskInfo } from './task-protocol';

@injectable()
export class TaskWatcher {

    getTaskClient(): TaskClient {
        const newTaskEmitter = this.onTaskCreatedEmitter;
        const exitEmitter = this.onTaskExitEmitter;
        return {
            onTaskCreated(event: TaskInfo) {
                newTaskEmitter.fire(event);
            },
            onTaskExit(event: TaskExitedEvent) {
                exitEmitter.fire(event);
            }
        };
    }

    protected onTaskCreatedEmitter = new Emitter<TaskInfo>();
    protected onTaskExitEmitter = new Emitter<TaskExitedEvent>();

    get onTaskCreated(): Event<TaskInfo> {
        return this.onTaskCreatedEmitter.event;
    }
    get onTaskExit(): Event<TaskExitedEvent> {
        return this.onTaskExitEmitter.event;
    }
}
