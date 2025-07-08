// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { PreferenceProxy } from '@theia/core/lib/common/preferences/preference-proxy';
import { PreferenceScope } from '@theia/core/lib/common/preferences/preference-scope';
import { PreferenceSchema } from '@theia/core/lib/common/preferences/preference-schema';

export const TOOLBAR_ENABLE_PREFERENCE_ID = 'toolbar.showToolbar';

export const ToolbarPreferencesSchema: PreferenceSchema = {
    properties: {
        [TOOLBAR_ENABLE_PREFERENCE_ID]: {
            'type': 'boolean',
            'description': 'Show toolbar',
            'default': false,
            'scope': PreferenceScope.Workspace,
        },
    },
};

class ToolbarPreferencesContribution {
    [TOOLBAR_ENABLE_PREFERENCE_ID]: boolean;
}

export const ToolbarPreferences = Symbol('ToolbarPreferences');
export type ToolbarPreferences = PreferenceProxy<ToolbarPreferencesContribution>;
