/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { Disposable } from '@theia/core/lib/common/disposable';
import { ProcessTaskRunner } from './process/process-task-runner';
import { Task } from './task';
import { TaskConfiguration } from '../common/task-protocol';

export const TaskRunnerContribution = Symbol('TaskRunnerContribution');

/** The {@link TaskRunnerContribution} can be used to contribute custom {@link TaskRunner}s. */
export interface TaskRunnerContribution {
    /**
     * Register custom runners using the given {@link TaskRunnerRegistry}.
     * @param runners the common task runner registry.
     */
    registerRunner(runners: TaskRunnerRegistry): void;
}

export const TaskRunner = Symbol('TaskRunner');
/**
 * A {@link TaskRunner} knows how to run a task configuration of a particular type.
 */
export interface TaskRunner {
    /**
     * Runs a task based on the given `TaskConfiguration`.
     * @param taskConfig the task configuration that should be executed.
     * @param ctx the execution context.
     *
     * @returns a promise of the (currently running) {@link Task}.
     */
    run(tskConfig: TaskConfiguration, ctx?: string): Promise<Task>;
}

/**
 * The {@link TaskRunnerRegistry} is the common component for the registration and provisioning of
 * {@link TaskRunner}s. Theia will collect all {@link TaskRunner}s and invoke {@link TaskRunnerContribution#registerRunner}
 * for each contribution. The `TaskServer` will use the runners provided by this registry to execute `TaskConfiguration`s that
 * have been triggered by the user.
 */
@injectable()
export class TaskRunnerRegistry {

    protected runners: Map<string, TaskRunner>;
    /** A Task Runner that will be used for executing a Task without an associated Runner. */
    protected defaultRunner: TaskRunner;

    @inject(ProcessTaskRunner)
    protected readonly processTaskRunner: ProcessTaskRunner;

    @postConstruct()
    protected init(): void {
        this.runners = new Map();
        this.defaultRunner = this.processTaskRunner;
    }
    /**
     * Registers the given {@link TaskRunner} to execute Tasks of the specified type.
     * If there is already a {@link TaskRunner} registered for the specified type the registration will
     * be overwritten with the new value.
     * @param type the task type for which the given runner should be registered.
     * @param runner the task runner that should be registered.
     *
     * @returns a `Disposable` that can be invoked to unregister the given runner.
     */
    registerRunner(type: string, runner: TaskRunner): Disposable {
        this.runners.set(type, runner);
        return {
            dispose: () => this.runners.delete(type)
        };
    }

    /**
     * Retrieves the {@link TaskRunner} registered for the specified Task type.
     * @param type the task type.
     *
     * @returns the registered {@link TaskRunner} or a default runner if none is registered for the specified type.
     */
    getRunner(type: string): TaskRunner {
        const runner = this.runners.get(type);
        return runner ? runner : this.defaultRunner;
    }

    /**
     * Derives all task types for which a {@link TaskRunner} is registered.
     *
     * @returns all derived task types.
     */
    getRunnerTypes(): string[] {
        return [...this.runners.keys()];
    }
}
