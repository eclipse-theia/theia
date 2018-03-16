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
    DebugConfigurationProviderRegistry,
    DebugConfigurationProvider,
    DebugSession,
    DebugConfigurationContribution,
    DebugConfiguration,
    DebugAdapterExecutable
} from "../common/debug-model";
import { DebugAdapterSession } from './debug-adapter';
import { UUID } from "@phosphor/coreutils";

/**
 * DebugConfigurationManager symbol for DI.
 */
export const DebugConfigurationManager = Symbol('DebugConfigurationManager');

/**
 * [Debug configuration](#DebugConfiguration) manager.
 */
export interface DebugConfigurationManager {
    /**
     * Finds and returns an array of registered debug types.
     * @returns An array of registered debug types
     */
    listDebugConfigurationProviders(): string[];

    /**
     * Provides initial debug configurations for the specific debug type.
     * @param debugType The registered debug type
     * @returns An array of [debug configurations](#DebugConfiguration)
     */
    provideDebugConfiguration(debugType: string): DebugConfiguration[];

    /**
     * Resolves debug configuration for the specific debug type.
     * @param debugType The registered debug type
     * @param config The debug configuration to resolve
     * @returns Resolved [debug configurations](#DebugConfiguration)
     */
    resolveDebugConfiguration(debugType: string, config: DebugConfiguration): DebugConfiguration | undefined;

    /**
     * Provide a [command line][#DebugAdapterExecutable] to launch debug adapter
     * @param debugType The registered debug type
     * @param config The debug configuration
     * @returns The command and arguments to launch a new debug adapter
     */
    provideDebugAdapterExecutable(debugType: string, config: DebugConfiguration): DebugAdapterExecutable | undefined;
}

/**
 * DebugConfigurationManager implementation.
 */
@injectable()
export class DebugConfigurationManagerImpl implements DebugConfigurationManager, DebugConfigurationProviderRegistry {
    protected readonly providers = new Map<string, DebugConfigurationProvider>();

    constructor(
        @inject(ContributionProvider) @named(DebugConfigurationContribution)
        protected readonly contributions: ContributionProvider<DebugConfigurationContribution>
    ) {
        for (const contrib of this.contributions.getContributions()) {
            contrib.registerDebugConfigurationProvider(this);
        }
    }

    registerDebugConfigurationProvider(debugType: string, provider: DebugConfigurationProvider): void {
        this.providers.set(debugType, provider);
    }

    listDebugConfigurationProviders(): string[] {
        return Array.from(this.providers.keys());
    }

    provideDebugConfiguration(debugType: string): DebugConfiguration[] {
        const provider = this.providers.get(debugType);
        return provider ? provider.provideDebugConfigurations() : [];
    }

    resolveDebugConfiguration(debugType: string, config: DebugConfiguration): DebugConfiguration | undefined {
        const provider = this.providers.get(debugType);
        return provider ? provider.resolveDebugConfiguration(config) : undefined;
    }

    provideDebugAdapterExecutable(debugType: string, config: DebugConfiguration): DebugAdapterExecutable | undefined {
        const provider = this.providers.get(debugType);
        return provider ? provider.provideDebugAdapterExecutable(config) : undefined;
    }
}

/**
 * DebugSessionManager symbol for DI.
 */
export const DebugSessionManager = Symbol('DebugSessionManager');

/**
 * [Debug session](#DebugSession) manager.
 */
export interface DebugSessionManager {
    /**
     * Creates a new [debug session](#DebugSession).
     * @param executable The [DebugAdapterExecutable](#DebugAdapterExecutable)
     * @returns The session identifier
     */
    start(executable: DebugAdapterExecutable): string | undefined;

    /**
     * Removes [debug session](#DebugSession) from the list of the instantiated sessions.
     * Is invoked when session is terminated and isn't needed anymore.
     * @param sessionId The session identifier
     */
    remove(sessionId: string): void;

    /**
     * Finds the debug session by its id.
     * Returning the value 'undefined' means the session isn't found.
     * @param sessionId The session identifier
     * @returns The debug session
     */
    find(sessionId: string): DebugSession | undefined;

    /**
     * Finds all instantiated debug sessions.
     * @returns An array of debug sessions identifiers
     */
    findAll(): string[];
}

/**
 * DebugSessionManager implementation.
 */
@injectable()
export class DebugSessionManagerImpl implements DebugSessionManager {
    protected readonly sessions = new Map<string, DebugSession>();

    constructor(
        @inject(DebugConfigurationManager)
        protected readonly debugConfigurationManger: DebugConfigurationManager,
        @inject("Factory<DebugAdapterSession>")
        protected readonly debugAdapterSessionFactory: (sessionId: string, executable: DebugAdapterExecutable) => DebugAdapterSession
    ) { }

    find(sessionId: string): DebugSession | undefined {
        return this.sessions.get(sessionId);
    }

    start(executable: DebugAdapterExecutable): string | undefined {
        const sessionId = UUID.uuid4();
        const session = this.debugAdapterSessionFactory(sessionId, executable);
        this.sessions.set(sessionId, session);

        return sessionId;
    }

    remove(sessionId: string): void {
        this.sessions.delete(sessionId);
    }

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

    @inject(DebugSessionManager)
    protected readonly debugSessionManager: DebugSessionManager;

    @inject(DebugConfigurationManager)
    protected readonly debugConfigurationManager: DebugConfigurationManager;

    async listDebugConfigurationProviders(): Promise<string[]> {
        return this.debugConfigurationManager.listDebugConfigurationProviders();
    }

    async provideDebugConfiguration(debugType: string): Promise<DebugConfiguration[]> {
        return this.debugConfigurationManager.provideDebugConfiguration(debugType);
    }

    async resolveDebugConfiguration(debugType: string, config: DebugConfiguration): Promise<DebugConfiguration | undefined> {
        return this.debugConfigurationManager.resolveDebugConfiguration(debugType, config);
    }

    async provideDebugAdapterExecutable(debugType: string, config: DebugConfiguration): Promise<DebugAdapterExecutable | undefined> {
        return this.debugConfigurationManager.provideDebugAdapterExecutable(debugType, config);
    }

    async start(executable: DebugAdapterExecutable): Promise<string | undefined> {
        return this.debugSessionManager.start(executable);
    }

    async dispose(): Promise<void> { }
}
