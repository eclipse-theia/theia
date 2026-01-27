// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { URI } from '@theia/core';
import { SessionStorageValue } from '../common/ai-chat-preferences';

/**
 * Service that provides dynamically computed default values for the session storage preference.
 * The defaults are computed based on the application's configuration directory.
 *
 * This consolidates the default value computation that was previously duplicated across:
 * - AIChatPreferenceContribution
 * - ChatSessionStoreImpl
 * - SessionStoragePreferenceRenderer (in ai-chat-ui)
 */
@injectable()
export class SessionStorageDefaultsProvider {
    @inject(EnvVariablesServer)
    protected readonly envServer: EnvVariablesServer;

    protected initialized = false;
    protected initPromise: Promise<void> | undefined;

    protected workspacePath: string = '.theia/chatSessions';
    protected globalPath: string = '';

    /**
     * Initialize the dynamic defaults. This is idempotent and will only compute once.
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }
        if (!this.initPromise) {
            this.initPromise = this.computeDefaults();
        }
        return this.initPromise;
    }

    protected async computeDefaults(): Promise<void> {
        const configDirUri = await this.envServer.getConfigDirUri();
        const configDir = new URI(configDirUri);
        const configFolderName = configDir.path.base || '.theia';
        this.workspacePath = `${configFolderName}/chatSessions`;
        this.globalPath = configDir.resolve('chatSessions').path.toString();
        this.initialized = true;
    }

    /**
     * Get the dynamically computed default workspace path.
     * Call `initialize()` first to ensure defaults are computed.
     */
    getDefaultWorkspacePath(): string {
        return this.workspacePath;
    }

    /**
     * Get the dynamically computed default global path.
     * Call `initialize()` first to ensure defaults are computed.
     */
    getDefaultGlobalPath(): string {
        return this.globalPath;
    }

    /**
     * Get the complete default SessionStorageValue with dynamically computed paths.
     * Call `initialize()` first to ensure defaults are computed.
     */
    getDefaultValue(): SessionStorageValue {
        return {
            scope: 'workspace',
            workspacePath: this.workspacePath,
            globalPath: this.globalPath
        };
    }

    /**
     * Merge partial preference values with dynamic defaults to get a complete SessionStorageValue.
     * Call `initialize()` first to ensure defaults are computed.
     */
    mergeWithDefaults(partial: Partial<SessionStorageValue> | undefined): SessionStorageValue {
        return {
            scope: partial?.scope ?? 'workspace',
            workspacePath: partial?.workspacePath ?? this.workspacePath,
            globalPath: partial?.globalPath ?? this.globalPath
        };
    }
}
