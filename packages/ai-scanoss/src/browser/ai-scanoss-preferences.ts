// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { PreferenceSchema } from '@theia/core/lib/browser/preferences';
import { AI_CORE_PREFERENCES_TITLE } from '@theia/ai-core/lib/browser/ai-core-preferences';
import { nls } from '@theia/core';

export const SCANOSS_MODE_PREF = 'ai-features.SCANOSS.mode';

export const AIScanOSSPreferencesSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        [SCANOSS_MODE_PREF]: {
            type: 'string',
            enum: ['off', 'manual', 'automatic'],
            markdownEnumDescriptions: [
                nls.localize('theia/ai/scanoss/mode/off/description', 'Feature is turned off completely.'),
                nls.localize('theia/ai/scanoss/mode/manual/description', 'User can manually trigger the scan by clicking the SCANOSS item in the chat view.'),
                nls.localize('theia/ai/scanoss/mode/automatic/description', 'Enable automatic scan of code snippets in chat views.')
            ],
            markdownDescription: nls.localize('theia/ai/scanoss/mode/description',
                'Configure the SCANOSS feature for analyzing code snippets in chat views. This will send a hash of suggested code snippets to the SCANOSS\n\
service hosted by the [Software Transparency foundation](https://www.softwaretransparency.org/osskb) for analysis.'),
            default: 'off',
            title: AI_CORE_PREFERENCES_TITLE
        }
    }
};
