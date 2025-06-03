// *****************************************************************************
// Copyright (C) 2025 TypeFox and others.
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
import { PreferenceSchema } from '@theia/core/lib/browser';

export const collaborationPreferencesSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        'collaboration.serverUrl': {
            type: 'string',
            default: 'https://api.open-collab.tools/',
            title: nls.localize('theia/collaboration/serverUrl', 'Server URL'),
            description: nls.localize('theia/collaboration/serverUrlDescription', 'URL of the Open Collaboration Tools Server instance for live collaboration sessions'),
        },
    },
    title: nls.localize('theia/collaboration/collaboration', 'Collaboration'),
};
