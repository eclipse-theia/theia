// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { nls, PreferenceContribution } from '@theia/core';
import { interfaces } from '@theia/core/shared/inversify';
import { PreferenceSchema } from '@theia/core/lib/common/preferences/preference-schema';

/**
 * Whether the API Samples extension shows its example action button on chat response nodes
 * (see {@link bindChatNodeToolbarActionContribution}). Surfaced as a contributed setting in the AI
 * Configuration view so toggling it has a real, observable effect on the chat UI.
 */
export const SAMPLE_CHAT_NODE_TOOLBAR_ENABLED_PREF = 'sampleChatNodeToolbar.enabled';

export const sampleChatNodeToolbarPreferenceSchema: PreferenceSchema = {
    properties: {
        [SAMPLE_CHAT_NODE_TOOLBAR_ENABLED_PREF]: {
            type: 'boolean',
            title: nls.localize('theia/api-samples/sampleChatNodeToolbar/enabled/title', 'Show Sample Chat Response Action'),
            markdownDescription: nls.localize('theia/api-samples/sampleChatNodeToolbar/enabled/description',
                'When enabled, the `@theia/api-samples` extension adds an example action button to each chat response. '
                + 'Turn it off to hide that sample action.'),
            default: true
        }
    }
};

export function bindSampleChatNodeToolbarPreferences(bind: interfaces.Bind): void {
    bind(PreferenceContribution).toConstantValue({ schema: sampleChatNodeToolbarPreferenceSchema });
}
