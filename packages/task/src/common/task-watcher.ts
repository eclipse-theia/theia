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
