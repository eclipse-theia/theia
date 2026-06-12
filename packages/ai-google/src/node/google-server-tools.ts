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

import { ServerToolDescriptor } from '@theia/ai-core';

/** Native Gemini server tool ids, used as descriptor ids and to select the native tool config. */
export const GOOGLE_URL_CONTEXT = 'url_context';
export const GOOGLE_GOOGLE_SEARCH = 'google_search';

/**
 * Server tools offered by the Gemini provider. These are executed by Google's infrastructure
 * (not by Theia) and are attached to each model's metadata so the chat UI can offer them.
 */
export const GOOGLE_SERVER_TOOLS: ServerToolDescriptor[] = [
    {
        id: GOOGLE_URL_CONTEXT,
        name: 'URL Context',
        description: 'Lets the model fetch and ground on the contents of URLs referenced in the prompt.'
    },
    {
        id: GOOGLE_GOOGLE_SEARCH,
        name: 'Google Search',
        description: 'Lets the model ground its answer with Google Search results.'
    }
];
