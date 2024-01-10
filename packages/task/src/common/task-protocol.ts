// *****************************************************************************
// Copyright (C) 2017 Ericsson and others.
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

import { Event } from '@theia/core';
import { RpcServer } from '@theia/core/lib/common/messaging/proxy-factory';
import { IJSONSchema } from '@theia/core/lib/common/json-schema';
import { ProblemMatcher, ProblemMatch, WatchingMatcherContribution, ProblemMatcherContribution, ProblemPatternContribution } from './problem-matcher-protocol';
export { WatchingMatcherContribution, ProblemMatcherContribution, ProblemPatternContribution };

export const taskPath = '/services/task';

export const TaskServer = Symbol('TaskServer');
export const TaskClient = Symbol('TaskClient');
export enum DependsOrder {
    Sequence = 'sequence',
    Parallel = 'parallel',
}

export enum RevealKind {
    Always = 'always',
    Silent = 'silent',
    Never = 'never'
}

export enum PanelKind {
    Shared = 'shared',
    Dedicated = 'dedicated',
    New = 'new'
}

export interface TaskOutputPresentation {
    echo?: boolean;
    focus?: boolean;
    reveal?: RevealKind;
    panel?: PanelKind;
    showReuseMessage?: boolean;
    clear?: boolean;
    close?: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [name: string]: any;
}
export namespace TaskOutputPresentation {
    export function getDefault(): TaskOutputPresentation {
        return {
            echo: true,
            reveal: RevealKind.Always,
            focus: false,
            panel: PanelKind.Shared,
            showReuseMessage: true,
            clear: false,
            close: false
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function fromJson(task: any): TaskOutputPresentation {
        let outputPresentation = getDefault();
        if (task && task.presentation) {
            if (task.presentation.reveal) {
                let reveal = RevealKind.Always;
                if (task.presentation.reveal === 'silent') {
                    reveal = RevealKind.Silent;
                } else if (task.presentation.reveal === 'never') {
                    reveal = RevealKind.Never;
                }
                outputPresentation = { ...outputPresentation, reveal };
            }
            if (task.presentation.panel) {
                let panel = PanelKind.Shared;
                if (task.presentation.panel === 'dedicated') {
                    panel = PanelKind.Dedicated;
                } else if (task.presentation.panel === 'new') {
                    panel = PanelKind.New;
                }
                outputPresentation = { ...outputPresentation, panel };
            }
            outputPresentation = {
                ...outputPresentation,
                echo: task.presentation.echo === undefined || task.presentation.echo,
                focus: shouldSetFocusToTerminal(task),
                showReuseMessage: shouldShowReuseMessage(task),
                clear: shouldClearTerminalBeforeRun(task),
                close: shouldCloseTerminalOnFinish(task)
            };
        }
        return outputPresentation;
    }

    export function shouldAlwaysRevealTerminal(task: TaskCustomization): boolean {
        return !task.presentation || task.presentation.reveal === undefined || task.presentation.reveal === RevealKind.Always;
    }

    export function shouldSetFocusToTerminal(task: TaskCustomization): boolean {
        return !!task.presentation && !!task.presentation.focus;
    }

    export function shouldClearTerminalBeforeRun(task: TaskCustomization): boolean {
        return !!task.presentation && !!task.presentation.clear;
    }

    export function shouldCloseTerminalOnFinish(task: TaskCustomization): boolean {
        return !!task.presentation && !!task.presentation.close;
    }

    export function shouldShowReuseMessage(task: TaskCustomization): boolean {
        return !task.presentation || task.presentation.showReuseMessage === undefined || !!task.presentation.showReuseMessage;
    }
}

export interface TaskCustomization {
    type: string;
    group?: 'build' | 'test' | 'rebuild' | 'clean' | 'none' | { kind: 'build' | 'test' | 'rebuild' | 'clean', isDefault: boolean };
    problemMatcher?: string | ProblemMatcherContribution | (string | ProblemMatcherContribution)[];
    presentation?: TaskOutputPresentation;
    detail?: string;

    /** Whether the task is a background task or not. */
    isBackground?: boolean;

    /** The other tasks the task depend on. */
    dependsOn?: string | TaskIdentifier | Array<string | TaskIdentifier>;

    /** The order the dependsOn tasks should be executed in. */
    dependsOrder?: DependsOrder;

    runOptions?: RunOptions;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [name: string]: any;
}
export namespace TaskCustomization {
    export function isBuildTask(task: TaskCustomization): boolean {
        return task.group === 'build' || typeof task.group === 'object' && task.group.kind === 'build';
    }

    export function isDefaultBuildTask(task: TaskCustomization): boolean {
        return isDefaultTask(task) && isBuildTask(task);
    }

    export function isDefaultTask(task: TaskCustomization): boolean {
        return typeof task.group === 'object' && task.group.isDefault;
    }

    export function isTestTask(task: TaskCustomization): boolean {
        return task.group === 'test' || typeof task.group === 'object' && task.group.kind === 'test';
    }

    export function isDefaultTestTask(task: TaskCustomization): boolean {
        return isDefaultTask(task) && isTestTask(task);
    }
}

export enum TaskScope {
    Global = 1,
    Workspace = 2
}

/**
 * The task configuration scopes.
 * - `string` represents the associated workspace folder uri.
 */
export type TaskConfigurationScope = string | TaskScope.Workspace | TaskScope.Global;

export interface TaskConfiguration extends TaskCustomization {
    /** A label that uniquely identifies a task configuration per source */
    readonly label: string;
    readonly _scope: TaskConfigurationScope;
}

export interface ContributedTaskConfiguration extends TaskConfiguration {
    /**
     * Source of the task configuration.
     * For a configured task, it is the name of the root folder, while for a provided task, it is the name of the provider.
     * This field is not supposed to be used in `tasks.json`
     */
    readonly _source: string;
}

/** A task identifier */
export interface TaskIdentifier {
    type: string;
    [name: string]: string;
}

/** Runtime information about Task. */
export interface TaskInfo {
    /** internal unique task id */
    readonly taskId: number,
    /** terminal id. Defined if task is run as a terminal process */
    readonly terminalId?: number,
    /** context that was passed as part of task creation, if any */
    readonly ctx?: string,
    /** task config used for launching a task */
    readonly config: TaskConfiguration,
    /** Additional properties specific for a particular Task Runner. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly [key: string]: any;
}

export interface TaskServer extends RpcServer<TaskClient> {
    /** Run a task. Optionally pass a context.  */
    run(task: TaskConfiguration, ctx?: string, option?: RunTaskOption): Promise<TaskInfo>;
    /** Kill a task, by id. */
    kill(taskId: number): Promise<void>;
    /**
     * Returns a list of currently running tasks. If a context is provided,
     * only the tasks started in that context will be provided. Using an
     * undefined context matches all tasks, no matter the creation context.
     */
    getTasks(ctx?: string): Promise<TaskInfo[]>

    /** removes the client that has disconnected */
    disconnectClient(client: TaskClient): void;

    /** Returns the list of default and registered task runners */
    getRegisteredTaskTypes(): Promise<string[]>

    /** plugin callback task complete */
    customExecutionComplete(id: number, exitCode: number | undefined): Promise<void>
}

export interface TaskCustomizationData {
    type: string;
    problemMatcher?: ProblemMatcher[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [name: string]: any;
}

export interface RunTaskOption {
    customization?: TaskCustomizationData;
}

export interface RunOptions {
    reevaluateOnRerun?: boolean;
}

/** Event sent when a task has concluded its execution */
export interface TaskExitedEvent {
    readonly taskId: number;
    readonly ctx?: string;

    // Exactly one of code and signal will be set.
    readonly code?: number;
    readonly signal?: string;

    readonly config?: TaskConfiguration;

    readonly terminalId?: number;
    readonly processId?: number;
}

export interface TaskOutputEvent {
    readonly taskId: number;
    readonly ctx?: string;
    readonly line: string;
}

export interface TaskOutputProcessedEvent {
    readonly taskId: number;
    readonly config: TaskConfiguration;
    readonly ctx?: string;
    readonly problems?: ProblemMatch[];
}

export interface BackgroundTaskEndedEvent {
    readonly taskId: number;
    readonly ctx?: string;
}

export interface TaskClient {
    onTaskExit(event: TaskExitedEvent): void;
    onTaskCreated(event: TaskInfo): void;
    onDidStartTaskProcess(event: TaskInfo): void;
    onDidEndTaskProcess(event: TaskExitedEvent): void;
    onDidProcessTaskOutput(event: TaskOutputProcessedEvent): void;
    onBackgroundTaskEnded(event: BackgroundTaskEndedEvent): void;
}

export interface TaskDefinition {
    taskType: string;
    source: string;
    properties: {
        /**
         * Should be treated as an empty array if omitted.
         * https://json-schema.org/draft/2020-12/json-schema-validation.html#rfc.section.6.5.3
         */
        required?: string[];
        all: string[];
        schema: IJSONSchema;
    }
}

export interface ManagedTask {
    id: number;
    context?: string;
}

export interface ManagedTaskManager<T extends ManagedTask> {
    onDelete: Event<number>;
    register(task: T, context?: string): number;
    get(id: number): T | undefined;
    getTasks(context?: string): T[] | undefined;
    delete(task: T): void;
}
