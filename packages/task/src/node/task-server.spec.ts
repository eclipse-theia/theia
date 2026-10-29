// *****************************************************************************
// Copyright (C) 2026 CodeSignal and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { TaskClient, TaskExitedEvent } from '../common';
import { CustomTask } from './custom/custom-task';
import { Task } from './task';
import { TaskServerImpl } from './task-server';

class TestTaskServer extends TaskServerImpl {
    constructor(client: TaskClient) {
        super();
        this.clients.push(client);
        Object.defineProperty(this, 'logger', { value: { debug: () => { } } });
    }

    exited(event: TaskExitedEvent, task?: Task): void {
        this.fireTaskExitedEvent(event, task);
    }
}

function recordingClient(processEnds: TaskExitedEvent[], taskExits: TaskExitedEvent[]): TaskClient {
    return {
        onTaskExit: e => taskExits.push(e),
        onTaskCreated: () => { },
        onDidStartTaskProcess: () => { },
        onDidEndTaskProcess: e => processEnds.push(e),
        onDidProcessTaskOutput: () => { },
        onBackgroundTaskEnded: () => { }
    };
}

describe('TaskServerImpl', () => {

    it('reports the end of a custom execution as the end of its process, with its exit code', () => {
        const processEnds: TaskExitedEvent[] = [];
        const taskExits: TaskExitedEvent[] = [];
        const server = new TestTaskServer(recordingClient(processEnds, taskExits));
        const event: TaskExitedEvent = { taskId: 1, ctx: 'test', code: 3 };

        server.exited(event, Object.create(CustomTask.prototype));

        expect(processEnds).to.deep.equal([event]);
        expect(taskExits).to.deep.equal([event]);
    });

    it('does not report a process end for a task without a process', () => {
        const processEnds: TaskExitedEvent[] = [];
        const server = new TestTaskServer(recordingClient(processEnds, []));

        server.exited({ taskId: 1, ctx: 'test', code: 0 }, undefined);

        expect(processEnds).to.deep.equal([]);
    });
});
