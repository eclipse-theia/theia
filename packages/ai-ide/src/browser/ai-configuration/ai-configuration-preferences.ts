// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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

import { nls } from '@theia/core';
import { PreferenceSchema } from '@theia/core/lib/browser/preferences/preference-contribution';

/**
 * These preferences are not intended to reflect real settings.
 * They are placeholders to redirect users to the appropriate widget
 * in case the user looks in the preferences editor UI to find the configuration.
 */
export const AiConfigurationPreferences: PreferenceSchema = {
    type: 'object',
    properties: {
        'ai-features.agentSettings.details': {
            type: 'null',
            markdownDescription: nls.localize('theia/ai/ide/agent-description',
                'Additional settings for AI agents can be configured using the [AI Configuration View]({0}).',
                'command:aiConfiguration:open'
            )
        },
        'ai-features.promptTemplates.details': {
            type: 'null',
            markdownDescription: nls.localize('theia/ai/ide/prompt-template-description',
                'Additional AI prompt template settings can be configured using the [AI Configuration View]({0}).',
                'command:aiConfiguration:open'
            )
        },
        'ai-features.models.details': {
            type: 'null',
            markdownDescription: nls.localize('theia/ai/ide/prompt-template-description',
                'Additional settings for AI models can be configured using the [AI Configuration View]({0}).',
                'command:aiConfiguration:open'
            )
        }
    }
};
