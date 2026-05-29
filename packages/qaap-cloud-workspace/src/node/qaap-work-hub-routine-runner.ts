// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { isQaapAgentTaskFinished, type QaapAgentTaskEvent } from '../common/qaap-agent-task';
import { QaapAgentTaskRunner } from './qaap-agent-task-runner';
import { QaapWorkHubRoutineStore } from './qaap-work-hub-routine-store';
import type { QaapWorkHubRoutine } from '@theia/qaap-mobile-shell/lib/common/qaap-work-hub-routine';

@injectable()
export class QaapWorkHubRoutineRunner {

    @inject(QaapWorkHubRoutineStore)
    protected readonly store: QaapWorkHubRoutineStore;

    @inject(QaapAgentTaskRunner)
    protected readonly taskRunner: QaapAgentTaskRunner;

    /** routine id → task id while we wait for completion */
    protected readonly taskToRoutine = new Map<string, string>();

    @postConstruct()
    protected init(): void {
        this.taskRunner.onDidChangeTask(event => this.onTaskChanged(event));
    }

    runNow(id: string): QaapWorkHubRoutine {
        const routine = this.store.get(id);
        if (!routine) {
            throw new Error('Routine not found.');
        }
        if (routine.lastRunState === 'running' && routine.lastRunTaskId) {
            const existing = this.taskRunner.listForCwd(routine.cwd)
                .find(task => task.id === routine.lastRunTaskId);
            if (existing && !isQaapAgentTaskFinished(existing.state)) {
                return routine;
            }
        }
        const task = this.taskRunner.create({
            cwd: routine.cwd,
            prompt: routine.prompt,
            agent: routine.agent ?? this.taskRunner.defaultAgent(),
            title: routine.title,
        });
        this.taskToRoutine.set(task.id, routine.id);
        const updated = this.store.markRunStarted(routine.id, task.id);
        return updated ?? routine;
    }

    protected onTaskChanged(event: QaapAgentTaskEvent): void {
        const routineId = this.taskToRoutine.get(event.task.id);
        if (!routineId) {
            return;
        }
        if (!isQaapAgentTaskFinished(event.task.state)) {
            return;
        }
        this.taskToRoutine.delete(event.task.id);
        const state = event.task.state === 'completed' ? 'completed' : 'failed';
        this.store.markRunFinished(routineId, state);
    }
}
