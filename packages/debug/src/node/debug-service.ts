/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import { injectable, inject, named } from "inversify";
import { ContributionProvider, ILogger } from '@theia/core';
import {
    DebugService,
    DebugSession,
    DebugConfiguration,
    DebugAdapterExecutable,
    DebugAdapterContribution,
    DebugAdapterFactory
} from "../common/debug-model";
import { DebugAdapterSession } from './debug-session';
import { UUID } from "@phosphor/coreutils";

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
    provideDebugConfigurations(debugType: string): DebugConfiguration[] | undefined {
        const contrib = this.contribs.get(debugType);
        if (contrib) {
            return contrib.provideDebugConfigurations();
        }
    }

    /**
     * Resolves a [debug configuration](#DebugConfiguration) by filling in missing values
     * or by adding/changing/removing attributes.
     * @param debugType The registered debug type
     * @param debugConfiguration The [debug configuration](#DebugConfiguration) to resolve.
     * @returns The resolved debug configuration.
     */
    resolveDebugConfiguration(debugType: string, config: DebugConfiguration): DebugConfiguration | undefined {
        const contrib = this.contribs.get(debugType);
        if (contrib) {
            return contrib.resolveDebugConfiguration(config);
        }
    }

    /**
     * Provides a [debug adapter executable](#DebugAdapterExecutable)
     * based on [debug configuration](#DebugConfiguration) to launch a new debug adapter.
     * @param debugType The registered debug type
     * @param config The resolved [debug configuration](#DebugConfiguration).
     * @returns The [debug adapter executable](#DebugAdapterExecutable).
     */
    provideDebugAdapterExecutable(debugType: string, config: DebugConfiguration): DebugAdapterExecutable | undefined {
        const contrib = this.contribs.get(debugType);
        if (contrib) {
            return contrib.provideDebugAdapterExecutable(config);
        }
    }
}

/**
 * Debug session manager.
 */
@injectable()
export class DebugSessionManager {
    protected readonly sessions = new Map<string, DebugSession>();

    constructor(
        @inject("Factory<DebugAdapterSession>")
        protected readonly debugSessionFactory: (sessionId: string, executable: DebugAdapterExecutable) => DebugAdapterSession
    ) { }

    /**
     * Creates a new [debug session](#DebugSession).
     * @param executable The [DebugAdapterExecutable](#DebugAdapterExecutable)
     * @returns The debug session
     */
    create(executable: DebugAdapterExecutable): DebugSession {
        const sessionId = UUID.uuid4();
        const session = this.debugSessionFactory(sessionId, executable);
        this.sessions.set(sessionId, session);
        return session;
    }

    /**
     * Removes [debug session](#DebugSession) from the list of the instantiated sessions.
     * Is invoked when session is terminated and isn't needed anymore.
     * @param sessionId The session identifier
     */
    remove(sessionId: string): void {
        this.sessions.delete(sessionId);
    }

    /**
     * Finds the debug session by its id.
     * Returning the value 'undefined' means the session isn't found.
     * @param sessionId The session identifier
     * @returns The debug session
     */
    find(sessionId: string): DebugSession | undefined {
        return this.sessions.get(sessionId);
    }

    /**
     * Finds all instantiated debug sessions.
     * @returns An array of debug sessions identifiers
     */
    findAll(): string[] {
        return Array.from(this.sessions.keys());
    }
}

/**
 * DebugService implementation.
 */
@injectable()
export class DebugServiceImpl implements DebugService {
    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(DebugAdapterFactory)
    protected readonly adapterFactory: DebugAdapterFactory;

    @inject(DebugSessionManager)
    protected readonly sessionManager: DebugSessionManager;

    @inject(DebugAdapterContributionRegistry)
    protected readonly registry: DebugAdapterContributionRegistry;

    async debugTypes(): Promise<string[]> {
        return this.registry.debugTypes();
    }

    async provideDebugConfigurations(debugType: string): Promise<DebugConfiguration[] | undefined> {
        return this.registry.provideDebugConfigurations(debugType);
    }

    async resolveDebugConfiguration(debugType: string, config: DebugConfiguration): Promise<DebugConfiguration | undefined> {
        return this.registry.resolveDebugConfiguration(debugType, config);
    }

    async startDebugSession(debugType: string, config: DebugConfiguration): Promise<string | undefined> {
        const executable = this.registry.provideDebugAdapterExecutable(debugType, config);
        if (executable) {
            const session = this.sessionManager.create(executable);
            if (session) {
                return session.id;
            }
        }
    }

    async dispose(): Promise<void> { }
}
