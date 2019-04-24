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

import { JsonRpcServer } from '@theia/core/lib/common/messaging/proxy-factory';
import { ProblemMatcher, ProblemPattern, NamedProblemMatcher, ProblemMatch } from './problem-matcher-protocol';

export const taskPath = '/services/task';

export const TaskServer = Symbol('TaskServer');
export const TaskClient = Symbol('TaskClient');

export interface TaskCustomization {
    type: string;
    problemMatcher?: string | ProblemMatcherContribution | (string | ProblemMatcherContribution)[];
    // tslint:disable-next-line:no-any
    [name: string]: any;
}

export interface TaskConfiguration extends TaskCustomization {
    /** A label that uniquely identifies a task configuration per source */
    readonly label: string;
}
export namespace TaskConfiguration {
    export function equals(one: TaskConfiguration, other: TaskConfiguration): boolean {
        return one.label === other.label && one._source === other._source;
    }
}

export interface ContributedTaskConfiguration extends TaskConfiguration {
    /**
     * Source of the task configuration.
     * For a configured task, it is the name of the root folder, while for a provided task, it is the name of the provider.
     * This field is not supposed to be used in `tasks.json`
     */
    readonly _source: string;
    /**
     * For a provided task, it is the string representation of the URI where the task is supposed to run from. It is `undefined` for global tasks.
     * This field is not supposed to be used in `tasks.json`
     */
    readonly _scope: string | undefined;
}
export namespace ContributedTaskConfiguration {
    export function is(config: TaskConfiguration | undefined): config is ContributedTaskConfiguration {
        return !!config && '_source' in config && '_scope' in config;
    }
}
export namespace TaskConfiguration {
    // tslint:disable-next-line:no-any
    export function is(config: any): config is TaskConfiguration {
        return !!config && typeof config === 'object' && 'label' in config && 'type' in config;
    }
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
    // tslint:disable-next-line:no-any
    readonly [key: string]: any;
}

export interface TaskServer extends JsonRpcServer<TaskClient> {
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

}

export interface RunTaskOption {
    customizations?: TaskCustomization[];
}

/** Event sent when a task has concluded its execution */
export interface TaskExitedEvent {
    readonly taskId: number;
    readonly ctx?: string;

    // Exactly one of code and signal will be set.
    readonly code?: number;
    readonly signal?: string;
}

export interface TaskOutputEvent {
    readonly taskId: number;
    readonly ctx?: string;
    readonly terminalId?: number;
    readonly line: string;
}

export interface TaskOutputProcessedEvent {
    readonly taskId: number;
    readonly ctx?: string;
    readonly terminalId?: number;
    readonly problems?: ProblemMatch[];
}

export interface TaskClient {
    onTaskExit(event: TaskExitedEvent): void;
    onTaskCreated(event: TaskInfo): void;
    onTaskOutputProcessed(event: TaskOutputProcessedEvent): void;
}

export interface TaskDefinition {
    id: string; // contributor id
    taskType: string;
    properties: {
        required: string[];
        all: string[];
    }
}

export interface TaskDefinitionContribution {
    type: string;
    required: string[];
    properties: {
        [name: string]: {
            type: string;
            description?: string;
            // tslint:disable-next-line:no-any
            [additionalProperty: string]: any;
        }
    }
}

export interface WatchingPatternContribution {
    regexp: string;
    file?: number;
}

export interface WatchingMatcherContribution {
    // If set to true the background monitor is in active mode when the task starts.
    // This is equals of issuing a line that matches the beginPattern
    activeOnStart?: boolean;
    beginsPattern: string | WatchingPatternContribution;
    endsPattern: string | WatchingPatternContribution;
}

export interface ProblemMatcherContribution {
    name: string;
    label: string;
    deprecated?: boolean;

    owner: string;
    source?: string;
    applyTo: string;
    fileLocation?: 'absolute' | 'relative' | string[];
    filePrefix?: string;
    pattern?: string | ProblemPatternContribution | ProblemPatternContribution[];
    severity?: string;
    watching?: WatchingMatcherContribution; // deprecated. Use `background`.
    background?: WatchingMatcherContribution;
}

export interface ProblemPatternContribution {
    name?: string;
    regexp: string;

    kind?: string;
    file?: number;
    message?: number;
    location?: number;
    line?: number;
    character?: number;
    endLine?: number;
    endCharacter?: number;
    code?: number;
    severity?: number;
    loop?: boolean;
}

export const taskDefinitionPath = '/services/taskDefinitionRegistry';
export const TaskDefinitionRegistry = Symbol('TaskDefinitionRegistry');
export interface TaskDefinitionRegistry {
    getDefinitions(taskType: string): TaskDefinition[];
    getDefinition(taskConfiguration: TaskConfiguration): TaskDefinition | undefined;
    register(definition: TaskDefinitionContribution, pluginId: string): Promise<void>;
}

export const problemPatternPath = '/services/problemPatternRegistry';
export const ProblemPatternRegistry = Symbol('ProblemPatternRegistry');
export interface ProblemPatternRegistry {
    onReady(): Promise<void>;
    register(key: string, value: ProblemPatternContribution | ProblemPatternContribution[]): Promise<void>;
    get(key: string): Promise<undefined | ProblemPattern | ProblemPattern[]>;
}

export const problemMatcherPath = '/services/problemMatcherRegistry';
export const ProblemMatcherRegistry = Symbol('ProblemMatcherRegistry');
export interface ProblemMatcherRegistry {
    onReady(): Promise<void>;
    register(matcher: ProblemMatcherContribution): Promise<void>;
    get(name: string): NamedProblemMatcher | undefined;
    getProblemMatcherFromContribution(matcher: ProblemMatcherContribution): Promise<ProblemMatcher>;
}
