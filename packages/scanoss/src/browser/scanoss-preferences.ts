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

export const SCAN_OSS_API_KEY_PREF = 'SCANOSS.apiKey';

export const ScanOSSPreferencesSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        [SCAN_OSS_API_KEY_PREF]: {
            type: 'string',
            markdownDescription: 'Enter an API Key of your SCANOSS  Account. **Please note:** By using this preference the key will be stored in clear text\
            on the machine running Theia. Use the environment variable `SCANOSS_API_KEY` to set the key securely.',
            title: 'SCANOSS API Key'
        }
    }
};
