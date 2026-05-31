// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { resolveRoutineAutoApprove } from '../common/qaap-agent-auto-approve';
import { isQaapAgentTaskFinished, type QaapAgentTaskEvent } from '../common/qaap-agent-task';
import {
    normalizeRoutineRunMode,
    type QaapWorkHubRoutine,
} from '@theia/qaap-mobile-shell/lib/common/qaap-work-hub-routine';
import { QaapAgentConversationStore } from './qaap-agent-conversation-store';
import { QaapAgentTaskRunner } from './qaap-agent-task-runner';
import { QaapWorkHubRoutineStore } from './qaap-work-hub-routine-store';

@injectable()
export class QaapWorkHubRoutineRunner {

    @inject(QaapWorkHubRoutineStore)
    protected readonly store: QaapWorkHubRoutineStore;

    @inject(QaapAgentTaskRunner)
    protected readonly taskRunner: QaapAgentTaskRunner;

    @inject(QaapAgentConversationStore)
    protected readonly conversationStore: QaapAgentConversationStore;

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
        if (normalizeRoutineRunMode(routine.runMode) === 'continue') {
            return this.runViaConversation(routine);
        }
        return this.runViaTask(routine);
    }

    protected runViaTask(routine: QaapWorkHubRoutine): QaapWorkHubRoutine {
        const task = this.taskRunner.create({
            cwd: routine.cwd,
            prompt: routine.prompt,
            agent: routine.agent ?? this.taskRunner.defaultAgent(),
            title: routine.title,
            autoApprove: resolveRoutineAutoApprove(routine.autoApprove),
        });
        this.taskToRoutine.set(task.id, routine.id);
        const updated = this.store.markRunStarted(routine.id, task.id);
        return updated ?? routine;
    }

    protected runViaConversation(routine: QaapWorkHubRoutine): QaapWorkHubRoutine {
        const agent = routine.agent ?? this.taskRunner.defaultAgent();
        let conversationId: string | undefined;
        let taskId: string | undefined;

        if (routine.lastRunConversationId) {
            const existing = this.conversationStore.get(routine.lastRunConversationId);
            if (existing
                && existing.cwd === routine.cwd
                && existing.status !== 'streaming') {
                const conv = this.conversationStore.postUserMessage(existing.id, routine.prompt, agent);
                conversationId = conv.id;
                taskId = [...conv.messages].reverse().find(m => m.role === 'user' && m.taskId)?.taskId;
            }
        }

        if (!conversationId || !taskId) {
            const conv = this.conversationStore.create({
                cwd: routine.cwd,
                agent,
                title: routine.title,
                message: routine.prompt,
            });
            conversationId = conv.id;
            taskId = conv.messages.find(m => m.role === 'user' && m.taskId)?.taskId;
        }

        if (!taskId) {
            throw new Error('Failed to start routine conversation turn.');
        }
        this.taskToRoutine.set(taskId, routine.id);
        const updated = this.store.markRunStarted(routine.id, taskId, conversationId);
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
