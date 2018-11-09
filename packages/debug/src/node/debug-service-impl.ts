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
import { DebugConfiguration } from '../common/debug-configuration';
import { DebugService, DebugAdapterPath, DebuggerDescription, DebugError } from '../common/debug-service';

import { UUID } from '@phosphor/coreutils';
import { DebugAdapterContribution, DebugAdapterExecutable, DebugAdapterSession, DebugAdapterSessionFactory, DebugAdapterFactory } from './debug-model';
import { MessagingService } from '@theia/core/lib/node';
import { IJSONSchema, IJSONSchemaSnippet } from '@theia/core/lib/common/json-schema';

/**
 * Contributions registry.
 */
@injectable()
export class DebugAdapterContributionRegistry {

    @inject(ContributionProvider) @named(DebugAdapterContribution)
    protected readonly contributions: ContributionProvider<DebugAdapterContribution>;
    protected *getContributions(debugType: string): IterableIterator<DebugAdapterContribution> {
        for (const contribution of this.contributions.getContributions()) {
            if (contribution.type === debugType || contribution.type === '*' || debugType === '*') {
                yield contribution;
            }
        }
    }

    /**
     * Finds and returns an array of registered debug types.
     * @returns An array of registered debug types
     */
    protected _debugTypes: string[] | undefined;
    debugTypes(): string[] {
        if (!this._debugTypes) {
            const result = new Set<string>();
            for (const contribution of this.contributions.getContributions()) {
                result.add(contribution.type);
            }
            this._debugTypes = [...result];
        }
        return this._debugTypes;
    }

    async getDebuggersForLanguage(language: string): Promise<DebuggerDescription[]> {
        const debuggers: DebuggerDescription[] = [];
        for (const contribution of this.contributions.getContributions()) {
            if (contribution.languages && contribution.label) {
                const label = await contribution.label;
                if (label && (await contribution.languages || []).indexOf(language) !== -1) {
                    debuggers.push({
                        type: contribution.type,
                        label
                    });
                }
            }
        }
        return debuggers;
    }

    /**
     * Provides initial [debug configuration](#DebugConfiguration).
     * @param debugType The registered debug type
     * @returns An array of [debug configurations](#DebugConfiguration)
     */
    async provideDebugConfigurations(debugType: string, workspaceFolderUri?: string): Promise<DebugConfiguration[]> {
        const configurations: DebugConfiguration[] = [];
        for (const contribution of this.getContributions(debugType)) {
            if (contribution.provideDebugConfigurations) {
                try {
                    configurations.push(...await contribution.provideDebugConfigurations(workspaceFolderUri));
                } catch (e) {
                    console.error(e);
                }
            }
        }
        return configurations;
    }

    /**
     * Resolves a [debug configuration](#DebugConfiguration) by filling in missing values
     * or by adding/changing/removing attributes.
     * @param debugConfiguration The [debug configuration](#DebugConfiguration) to resolve.
     * @returns The resolved debug configuration.
     */
    async resolveDebugConfiguration(config: DebugConfiguration, workspaceFolderUri?: string): Promise<DebugConfiguration> {
        let current = config;
        for (const contribution of this.getContributions(config.type)) {
            if (contribution.resolveDebugConfiguration) {
                try {
                    const next = await contribution.resolveDebugConfiguration(config, workspaceFolderUri);
                    if (next) {
                        current = next;
                    } else {
                        return current;
                    }
                } catch (e) {
                    console.error(e);
                }
            }
        }
        return current;
    }

    /**
     * Provides schema attributes.
     * @param debugType The registered debug type
     * @returns Schema attributes for the given debug type
     */
    async getSchemaAttributes(debugType: string): Promise<IJSONSchema[]> {
        const schemas: IJSONSchema[] = [];
        for (const contribution of this.getContributions(debugType)) {
            if (contribution.getSchemaAttributes) {
                try {
                    schemas.push(...await contribution.getSchemaAttributes());
                } catch (e) {
                    console.error(e);
                }
            }
        }
        return schemas;
    }
    async getConfigurationSnippets(): Promise<IJSONSchemaSnippet[]> {
        const schemas: IJSONSchemaSnippet[] = [];
        for (const contribution of this.getContributions('*')) {
            if (contribution.getConfigurationSnippets) {
                try {
                    schemas.push(...await contribution.getConfigurationSnippets());
                } catch (e) {
                    console.error(e);
                }
            }
        }
        return schemas;
    }

    /**
     * Provides a [debug adapter executable](#DebugAdapterExecutable)
     * based on [debug configuration](#DebugConfiguration) to launch a new debug adapter.
     * @param config The resolved [debug configuration](#DebugConfiguration).
     * @returns The [debug adapter executable](#DebugAdapterExecutable).
     */
    async provideDebugAdapterExecutable(config: DebugConfiguration): Promise<DebugAdapterExecutable> {
        for (const contribution of this.getContributions(config.type)) {
            if (contribution.provideDebugAdapterExecutable) {
                return contribution.provideDebugAdapterExecutable(config);
            }
        }
        throw DebugError.NotFound(config.type);
    }

    /**
     * Returns a [debug adapter session factory](#DebugAdapterSessionFactory).
     * @param debugType The registered debug type
     * @returns An [debug adapter session factory](#DebugAdapterSessionFactory)
     */
    debugAdapterSessionFactory(debugType: string): DebugAdapterSessionFactory | undefined {
        for (const contribution of this.getContributions(debugType)) {
            if (contribution.debugAdapterSessionFactory) {
                return contribution.debugAdapterSessionFactory;
            }
        }
        return undefined;
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
    async create(config: DebugConfiguration): Promise<DebugAdapterSession> {
        const sessionId = UUID.uuid4();

        let communicationProvider;
        if ('debugServer' in config) {
            communicationProvider = this.debugAdapterFactory.connect(config.debugServer);
        } else {
            const executable = await this.registry.provideDebugAdapterExecutable(config);
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
            channel.onClose(() => this.stop(id));
            session.start(channel);
        });
    }

    async debugTypes(): Promise<string[]> {
        return this.registry.debugTypes();
    }

    getDebuggersForLanguage(language: string): Promise<DebuggerDescription[]> {
        return this.registry.getDebuggersForLanguage(language);
    }

    getSchemaAttributes(debugType: string): Promise<IJSONSchema[]> {
        return this.registry.getSchemaAttributes(debugType);
    }

    getConfigurationSnippets(): Promise<IJSONSchemaSnippet[]> {
        return this.registry.getConfigurationSnippets();
    }

    async provideDebugConfigurations(debugType: string, workspaceFolderUri?: string): Promise<DebugConfiguration[]> {
        return this.registry.provideDebugConfigurations(debugType, workspaceFolderUri);
    }
    async resolveDebugConfiguration(config: DebugConfiguration, workspaceFolderUri?: string): Promise<DebugConfiguration> {
        return this.registry.resolveDebugConfiguration(config, workspaceFolderUri);
    }

    async create(config: DebugConfiguration): Promise<string> {
        const session = await this.sessionManager.create(config);
        return session.id;
    }

    async stop(sessionId?: string): Promise<void> {
        if (sessionId) {
            const debugSession = this.sessionManager.find(sessionId);
            if (debugSession) {
                this.sessionManager.remove(sessionId);
                await debugSession.stop();
            }
        } else {
            const promises: Promise<void>[] = [];
            for (const session of this.sessionManager.getAll()) {
                promises.push((async () => {
                    try {
                        this.sessionManager.remove(session.id);
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
