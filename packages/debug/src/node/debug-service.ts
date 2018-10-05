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

import { injectable, inject, named } from 'inversify';
import { ContributionProvider } from '@theia/core';
import {
    DebugService,
    DebugConfiguration,
    DebugAdapterPath
} from '../common/debug-common';

import { UUID } from '@phosphor/coreutils';
import { DebugAdapterContribution, DebugAdapterExecutable, DebugAdapterSession, DebugAdapterSessionFactory, DebugAdapterFactory } from './debug-model';
import { MessagingService } from '@theia/core/lib/node';
import { IJSONSchema } from '@theia/core/src/common/json-schema';

/**
 * Contributions registry.
 */
@injectable()
export class DebugAdapterContributionRegistry {
    protected readonly contribs = new Map<string, DebugAdapterContribution>();

    constructor(
        @inject(ContributionProvider) @named(DebugAdapterContribution)
        protected readonly contributions: ContributionProvider<DebugAdapterContribution>
    ) {
        for (const contrib of this.contributions.getContributions()) {
            this.contribs.set(contrib.debugType, contrib);
        }
    }

    /**
     * Finds and returns an array of registered debug types.
     * @returns An array of registered debug types
     */
    debugTypes(): string[] {
        return Array.from(this.contribs.keys());
    }

    /**
     * Provides initial [debug configuration](#DebugConfiguration).
     * @param debugType The registered debug type
     * @returns An array of [debug configurations](#DebugConfiguration)
     */
    provideDebugConfigurations(debugType: string): DebugConfiguration[] {
        const contrib = this.contribs.get(debugType);
        if (contrib) {
            return contrib.provideDebugConfigurations;
        }
        throw new Error(`Debug adapter '${debugType}' isn't registered.`);
    }

    /**
     * Provides schema attributes.
     * @param debugType The registered debug type
     * @returns Schema attributes for the given debug type
     */
    getSchemaAttributes(debugType: string): Promise<IJSONSchema[]> {
        const contrib = this.contribs.get(debugType);
        if (contrib) {
            return contrib.getSchemaAttributes();
        }
        throw new Error(`Debug adapter '${debugType}' isn't registered.`);
    }

    /**
     * Resolves a [debug configuration](#DebugConfiguration) by filling in missing values
     * or by adding/changing/removing attributes.
     * @param debugConfiguration The [debug configuration](#DebugConfiguration) to resolve.
     * @returns The resolved debug configuration.
     */
    resolveDebugConfiguration(config: DebugConfiguration): DebugConfiguration {
        const contrib = this.contribs.get(config.type);
        if (contrib) {
            return contrib.resolveDebugConfiguration(config);
        }
        throw new Error(`Debug adapter '${config.type}' isn't registered.`);
    }

    /**
     * Provides a [debug adapter executable](#DebugAdapterExecutable)
     * based on [debug configuration](#DebugConfiguration) to launch a new debug adapter.
     * @param config The resolved [debug configuration](#DebugConfiguration).
     * @returns The [debug adapter executable](#DebugAdapterExecutable).
     */
    provideDebugAdapterExecutable(config: DebugConfiguration): DebugAdapterExecutable {
        const contrib = this.contribs.get(config.type);
        if (contrib) {
            return contrib.provideDebugAdapterExecutable(config);
        }
        throw new Error(`Debug adapter '${config.type}' isn't registered.`);
    }

    /**
     * Returns a [debug adapter session factory](#DebugAdapterSessionFactory).
     * @param debugType The registered debug type
     * @returns An [debug adapter session factory](#DebugAdapterSessionFactory)
     */
    debugAdapterSessionFactory(debugType: string): DebugAdapterSessionFactory | undefined {
        const contrib = this.contribs.get(debugType);
        if (contrib) {
            return contrib.debugAdapterSessionFactory;
        }
    }
}

/**
 * Debug adapter session manager.
 */
@injectable()
export class DebugAdapterSessionManager {
    protected readonly sessions = new Map<string, DebugAdapterSession>();

    constructor(
        @inject(DebugAdapterContributionRegistry)
        protected readonly registry: DebugAdapterContributionRegistry,
        @inject(DebugAdapterSessionFactory)
        protected readonly debugAdapterSessionFactory: DebugAdapterSessionFactory,
        @inject(DebugAdapterFactory)
        protected readonly debugAdapterFactory: DebugAdapterFactory
    ) { }

    /**
     * Creates a new [debug adapter session](#DebugAdapterSession).
     * @param config The [DebugConfiguration](#DebugConfiguration)
     * @returns The debug adapter session
     */
    create(config: DebugConfiguration): DebugAdapterSession {
        const sessionId = UUID.uuid4();

        let communicationProvider;
        if ('debugServer' in config) {
            communicationProvider = this.debugAdapterFactory.connect(config.debugServer);
        } else {
            const executable = this.registry.provideDebugAdapterExecutable(config);
            communicationProvider = this.debugAdapterFactory.start(executable);
        }

        const sessionFactory = this.registry.debugAdapterSessionFactory(config.type) || this.debugAdapterSessionFactory;
        const session = sessionFactory.get(sessionId, communicationProvider);
        this.sessions.set(sessionId, session);
        return session;
    }

    /**
     * Removes [debug adapter session](#DebugAdapterSession) from the list of the instantiated sessions.
     * Is invoked when session is terminated and isn't needed anymore.
     * @param sessionId The session identifier
     */
    remove(sessionId: string): void {
        this.sessions.delete(sessionId);
    }

    /**
     * Finds the debug adapter session by its id.
     * Returning the value 'undefined' means the session isn't found.
     * @param sessionId The session identifier
     * @returns The debug adapter session
     */
    find(sessionId: string): DebugAdapterSession | undefined {
        return this.sessions.get(sessionId);
    }

    /**
     * Returns all instantiated debug adapter sessions.
     * @returns An array of debug adapter sessions
     */
    getAll(): IterableIterator<DebugAdapterSession> {
        return this.sessions.values();
    }
}

/**
 * DebugService implementation.
 */
@injectable()
export class DebugServiceImpl implements DebugService, MessagingService.Contribution {

    @inject(DebugAdapterSessionManager)
    protected readonly sessionManager: DebugAdapterSessionManager;

    @inject(DebugAdapterContributionRegistry)
    protected readonly registry: DebugAdapterContributionRegistry;

    dispose(): void {
        this.stop();
    }

    configure(service: MessagingService): void {
        service.wsChannel(`${DebugAdapterPath}/:id`, ({ id }: { id: string }, channel) => {
            const session = this.sessionManager.find(id);
            if (!session) {
                channel.close();
                return;
            }
            session.start(channel);
        });
    }

    async debugTypes(): Promise<string[]> {
        return this.registry.debugTypes();
    }

    async provideDebugConfigurations(debugType: string): Promise<DebugConfiguration[]> {
        return this.registry.provideDebugConfigurations(debugType);
    }

    getSchemaAttributes(debugType: string): Promise<IJSONSchema[]> {
        return this.registry.getSchemaAttributes(debugType);
    }

    async resolveDebugConfiguration(config: DebugConfiguration): Promise<DebugConfiguration> {
        return this.registry.resolveDebugConfiguration(config);
    }

    async create(config: DebugConfiguration): Promise<string> {
        const session = this.sessionManager.create(config);
        return session.id;
    }

    async stop(sessionId?: string): Promise<void> {
        if (sessionId) {
            const debugSession = this.sessionManager.find(sessionId);
            if (debugSession) {
                await debugSession.stop();
            }
        } else {
            const promises: Promise<void>[] = [];
            for (const session of this.sessionManager.getAll()) {
                promises.push((async () => {
                    try {
                        await session.stop();
                    } catch (e) {
                        console.error(e);
                    }
                })());
            }
            await Promise.all(promises);
        }
    }
}
