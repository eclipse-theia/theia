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

import { injectable, postConstruct } from 'inversify';
import { Disposable } from '@theia/core/lib/common/disposable';
import { TaskConfiguration } from '../common/task-protocol';
import { WaitUntilEvent, Emitter } from '@theia/core/lib/common/event';

export const TaskContribution = Symbol('TaskContribution');

/** Allows to contribute custom Task Resolvers, Task Providers. */
export interface TaskContribution {
    registerResolvers?(resolvers: TaskResolverRegistry): void;
    registerProviders?(providers: TaskProviderRegistry): void;
}

export interface TaskResolver {
    /** Resolves a Task Configuration before sending it for execution to the Task Server. */
    resolveTask(taskConfig: TaskConfiguration): Promise<TaskConfiguration>;
}

export interface TaskProvider {
    /** Returns the Task Configurations which are provides programmatically to the system. */
    provideTasks(): Promise<TaskConfiguration[]>;
}

@injectable()
export class TaskResolverRegistry {

    protected readonly onWillProvideTaskResolverEmitter = new Emitter<WaitUntilEvent>();
    readonly onWillProvideTaskResolver = this.onWillProvideTaskResolverEmitter.event;

    protected resolvers: Map<string, TaskResolver>;

    @postConstruct()
    protected init(): void {
        this.resolvers = new Map();
    }

    /** Registers the given Task Resolver to resolve the Task Configurations of the specified type. */
    register(type: string, resolver: TaskResolver): Disposable {
        this.resolvers.set(type, resolver);
        return {
            dispose: () => this.resolvers.delete(type)
        };
    }

    async getResolver(type: string): Promise<TaskResolver | undefined> {
        await WaitUntilEvent.fire(this.onWillProvideTaskResolverEmitter, {});
        return this.resolvers.get(type);
    }
}

@injectable()
export class TaskProviderRegistry {

    protected readonly onWillProvideTaskProviderEmitter = new Emitter<WaitUntilEvent>();
    readonly onWillProvideTaskProvider = this.onWillProvideTaskProviderEmitter.event;

    protected providers: Map<string, TaskProvider>;

    @postConstruct()
    protected init(): void {
        this.providers = new Map();
    }

    /** Registers the given Task Provider to return Task Configurations of the specified type. */
    register(type: string, provider: TaskProvider, handle?: number): Disposable {
        const key = handle === undefined ? type : `${type}::${handle}`;
        this.providers.set(key, provider);
        return {
            dispose: () => this.providers.delete(key)
        };
    }

    async getProvider(type: string): Promise<TaskProvider | undefined> {
        await WaitUntilEvent.fire(this.onWillProvideTaskProviderEmitter, {});
        return this.providers.get(type);
    }

    /** Returns all registered Task Providers. */
    async getProviders(): Promise<TaskProvider[]> {
        await WaitUntilEvent.fire(this.onWillProvideTaskProviderEmitter, {});
        return [...this.providers.values()];
    }
}
