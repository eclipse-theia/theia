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
import { PreferenceContribution, PreferenceSchema, PreferenceSchemaService } from '@theia/core/lib/common/preferences/preference-schema';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { URI } from '@theia/core';
import { SESSION_STORAGE_PREF, SessionStorageValue } from '../common/ai-chat-preferences';

/**
 * Preference contribution that dynamically sets the default workspace path
 * for chat session storage based on the actual configuration folder name.
 */
@injectable()
export class AIChatPreferenceContribution implements PreferenceContribution {
    @inject(EnvVariablesServer)
    protected readonly envServer: EnvVariablesServer;

    schema: PreferenceSchema = { properties: {} };

    async initSchema(service: PreferenceSchemaService): Promise<void> {
        const configDirUri = await this.envServer.getConfigDirUri();
        const configDir = new URI(configDirUri);
        const configFolderName = configDir.path.base || '.theia';
        const dynamicWorkspacePath = `${configFolderName}/chatSessions`;

        const dynamicDefault: SessionStorageValue = {
            scope: 'workspace',
            workspacePath: dynamicWorkspacePath,
            globalPath: ''
        };

        service.registerOverride(SESSION_STORAGE_PREF, undefined, dynamicDefault);
    }
}
