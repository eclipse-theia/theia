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

import { injectable, inject } from "inversify";
import { ILogger } from '@theia/core';
import {
    DebugServer,
    DebugConfigurationRegistry,
    DebugConfigurationProvider,
    DebugSessionFactoryRegistry,
    DebugSessionFactory,
    DebugSession
} from "../common/debug-server";
import { DebugConfiguration } from "../common/debug-model";
import { DebugProtocol } from 'vscode-debugprotocol';

/**
 * DebugConfigurationManager symbol for DI.
 */
export const DebugConfigurationManager = Symbol('DebugConfigurationManager');

/**
 * Debug configuration manager.
 */
export interface DebugConfigurationManager extends DebugConfigurationRegistry {
    /**
     * Finds and returns an array of registered debugger types.
     * @return An array of registered debugger types
     */
    listDebugConfigurationProviders(): string[];

    /**
     * Provides initial debug configurations for the specific debugger type.
     * @param debuggerType The registered debugger type
     * @return An array of [debug configurations](#DebugConfiguration)
     */
    provideDebugConfiguration(debuggerType: string): DebugConfiguration[];

    /**
     * Resolves debug configuration for the specific debugger type.
     * @param debuggerType The registered debugger type
     * @param config The debug configuration to resolve
     */
    resolveDebugConfiguration(debuggerType: string, config: DebugConfiguration): DebugConfiguration | undefined;
}

/**
 * DebugConfigurationManager implementation.
 */
@injectable()
export class DebugConfigurationManagerImpl implements DebugConfigurationManager {
    protected readonly providers = new Map<string, DebugConfigurationProvider>();

    registerDebugConfigurationProvider(debuggerType: string, provider: DebugConfigurationProvider) {
        this.providers.set(debuggerType, provider);
    }

    unregisterDebugConfigurationProvider(debuggerType: string) {
        this.providers.delete(debuggerType);
    }

    listDebugConfigurationProviders() {
        return Array.from(this.providers.keys());
    }

    provideDebugConfiguration(debuggerType: string) {
        const provider = this.providers.get(debuggerType);
        return provider ? provider.provideDebugConfigurations() : [];
    }

    resolveDebugConfiguration(debuggerType: string, config: DebugConfiguration) {
        const provider = this.providers.get(debuggerType);
        return provider ? provider.resolveDebugConfiguration(config) : undefined;
    }
}

/**
 * DebugSessionManager symbol for DI.
 */
export const DebugSessionManager = Symbol('DebugSessionManager');

/**
 * [Debug session](#DebugSession) manager.
 */
export interface DebugSessionManager extends DebugSessionFactoryRegistry {
    /**
     * Creates [debug session](#DebugSession) for the specific debugger type by resolved
     * debug configuration. The [debug session factory](#DebugSessionFactory) is used to instantiate the session.
     * @param debuggerType The registered debugger type
     * @param config The debug configuration
     * @return The session identifier
     */
    create(debuggerType: string, config: DebugConfiguration): string | undefined;

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
     * @return The debug session
     */
    find(sessionId: string): DebugSession | undefined;

    /**
     * Finds all instantiated debug sessions.
     * @return An array of debug sessions identifiers
     */
    findAll(): string[];
}

/**
 * DebugSessionManager implementation.
 */
@injectable()
export class DebugSessionManagerImpl implements DebugSessionManager {
    protected readonly factories = new Map<string, DebugSessionFactory>();
    protected readonly sessions = new Map<string, DebugSession>();

    find(sessionId: string) {
        return this.sessions.get(sessionId);
    }

    create(debuggerType: string, config: DebugConfiguration) {
        const factory = this.factories.get(debuggerType);
        if (factory) {
            const session = factory.create(config);
            if (session) {
                const sessionId = "";
                this.sessions.set(sessionId, session);
                return sessionId;
            }
        }
    }

    remove(sessionId: string): void {
        this.sessions.delete(sessionId);
    }

    registerDebugSessionFactory(debuggerType: string, factory: DebugSessionFactory) {
        this.factories.set(debuggerType, factory);
    }

    findAll() {
        return Array.from(this.sessions.keys());
    }
}

/**
 * Debug server implementation.
 */
@injectable()
export class DebugServerImpl implements DebugServer {
    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(DebugSessionManager)
    protected readonly debugSessionManager: DebugSessionManager;

    @inject(DebugConfigurationManager)
    protected readonly debugConfigurationManager: DebugConfigurationManager;

    listDebugConfigurationProviders() {
        const a = this.debugConfigurationManager.listDebugConfigurationProviders();
        this.logger.info(">>>>>>>>>>>>>>>>");
        this.logger.info(a.toString);
        return this.debugConfigurationManager.listDebugConfigurationProviders();
    }

    provideDebugConfiguration(debuggerType: string) {
        return this.debugConfigurationManager.provideDebugConfiguration(debuggerType);
    }

    resolveDebugConfiguration(debuggerType: string, config: DebugConfiguration) {
        return this.debugConfigurationManager.resolveDebugConfiguration(debuggerType, config);
    }

    createDebugSession(debuggerType: string, config: DebugConfiguration) {
        return this.debugSessionManager.create(debuggerType, config);
    }

    initializeRequest(sessionId: string, initializeRequest: DebugProtocol.InitializeRequest) {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.initializeRequest(initializeRequest);
        }
    }

    dispose(): void {
        const ids = this.debugSessionManager.findAll();
        for (let id of ids) {
            const session = this.debugSessionManager.find(id);
            if (session) {
                this.debugSessionManager.remove(id);
                session.dispose();
            }
        }
    }
}
