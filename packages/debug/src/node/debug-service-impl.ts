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

import { injectable, inject } from '@theia/core/shared/inversify';
import { DebugConfiguration } from '../common/debug-configuration';
import { DebugService, DebuggerDescription } from '../common/debug-service';

import { IJSONSchema, IJSONSchemaSnippet } from '@theia/core/lib/common/json-schema';
import { DebugAdapterSessionManager } from './debug-adapter-session-manager';
import { DebugAdapterContributionRegistry } from './debug-adapter-contribution-registry';

/**
 * DebugService implementation.
 */
@injectable()
export class DebugServiceImpl implements DebugService {

    @inject(DebugAdapterSessionManager)
    protected readonly sessionManager: DebugAdapterSessionManager;

    @inject(DebugAdapterContributionRegistry)
    protected readonly registry: DebugAdapterContributionRegistry;

    dispose(): void {
        this.terminateDebugSession();
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
    async resolveDebugConfigurationWithSubstitutedVariables(config: DebugConfiguration, workspaceFolderUri?: string): Promise<DebugConfiguration> {
        return this.registry.resolveDebugConfigurationWithSubstitutedVariables(config, workspaceFolderUri);
    }

    protected readonly sessions = new Set<string>();
    async createDebugSession(config: DebugConfiguration): Promise<string> {
        const session = await this.sessionManager.create(config, this.registry);
        this.sessions.add(session.id);
        return session.id;
    }

    async terminateDebugSession(sessionId?: string): Promise<void> {
        if (sessionId) {
            await this.doStop(sessionId);
        } else {
            const promises: Promise<void>[] = [];
            const sessions = [...this.sessions];
            this.sessions.clear();
            for (const session of sessions) {
                promises.push((async () => {
                    try {
                        await this.doStop(session);
                    } catch (e) {
                        console.error(e);
                    }
                })());
            }
            await Promise.all(promises);
        }
    }
    protected async doStop(sessionId: string): Promise<void> {
        const debugSession = this.sessionManager.find(sessionId);
        if (debugSession) {
            this.sessionManager.remove(sessionId);
            this.sessions.delete(sessionId);
            await debugSession.stop();
        }
    }

}
