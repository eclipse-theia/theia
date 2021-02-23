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
import { TaskClient, TaskExitedEvent, TaskInfo, TaskOutputProcessedEvent, BackgroundTaskEndedEvent } from './task-protocol';

@injectable()
export class TaskWatcher {

    getTaskClient(): TaskClient {
        const newTaskEmitter = this.onTaskCreatedEmitter;
        const exitEmitter = this.onTaskExitEmitter;
        const taskProcessStartedEmitter = this.onDidStartTaskProcessEmitter;
        const taskProcessEndedEmitter = this.onDidEndTaskProcessEmitter;
        const outputProcessedEmitter = this.onOutputProcessedEmitter;
        const backgroundTaskEndedEmitter = this.onBackgroundTaskEndedEmitter;
        return {
            onTaskCreated(event: TaskInfo): void {
                newTaskEmitter.fire(event);
            },
            onTaskExit(event: TaskExitedEvent): void {
                exitEmitter.fire(event);
            },
            onDidStartTaskProcess(event: TaskInfo): void {
                taskProcessStartedEmitter.fire(event);
            },
            onDidEndTaskProcess(event: TaskExitedEvent): void {
                taskProcessEndedEmitter.fire(event);
            },
            onDidProcessTaskOutput(event: TaskOutputProcessedEvent): void {
                outputProcessedEmitter.fire(event);
            },
            onBackgroundTaskEnded(event: BackgroundTaskEndedEvent): void {
                backgroundTaskEndedEmitter.fire(event);
            }
        };
    }

    protected onTaskCreatedEmitter = new Emitter<TaskInfo>();
    protected onTaskExitEmitter = new Emitter<TaskExitedEvent>();
    protected onDidStartTaskProcessEmitter = new Emitter<TaskInfo>();
    protected onDidEndTaskProcessEmitter = new Emitter<TaskExitedEvent>();
    protected onOutputProcessedEmitter = new Emitter<TaskOutputProcessedEvent>();
    protected onBackgroundTaskEndedEmitter = new Emitter<BackgroundTaskEndedEvent>();

    get onTaskCreated(): Event<TaskInfo> {
        return this.onTaskCreatedEmitter.event;
    }
    get onTaskExit(): Event<TaskExitedEvent> {
        return this.onTaskExitEmitter.event;
    }
    get onDidStartTaskProcess(): Event<TaskInfo> {
        return this.onDidStartTaskProcessEmitter.event;
    }
    get onDidEndTaskProcess(): Event<TaskExitedEvent> {
        return this.onDidEndTaskProcessEmitter.event;
    }
    get onOutputProcessed(): Event<TaskOutputProcessedEvent> {
        return this.onOutputProcessedEmitter.event;
    }
    get onBackgroundTaskEnded(): Event<BackgroundTaskEndedEvent> {
        return this.onBackgroundTaskEndedEmitter.event;
    }
}
