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

/** Native Anthropic server tool ids, used both as descriptor ids and as the API tool `name`. */
export const ANTHROPIC_WEB_FETCH = 'web_fetch';
export const ANTHROPIC_WEB_SEARCH = 'web_search';

/** Native Anthropic name for the deferred-tool search server tool (used when converting tools for the API). */
export const ANTHROPIC_TOOL_SEARCH_NATIVE = 'tool_search_tool_bm25';
/** Stable, user-facing name under which the deferred-tool search is surfaced as a server tool call. */
export const ANTHROPIC_TOOL_SEARCH = 'tool_search';

/**
 * Server tools offered by the Anthropic provider. These are executed by Anthropic's infrastructure
 * (not by Theia) and are attached to each model's metadata so the chat UI can offer them.
 */
export const ANTHROPIC_SERVER_TOOLS: ServerToolDescriptor[] = [
    {
        id: ANTHROPIC_WEB_FETCH,
        name: 'Web Fetch',
        description: 'Lets the model fetch the contents of a URL on Anthropic\'s infrastructure.'
    },
    {
        id: ANTHROPIC_WEB_SEARCH,
        name: 'Web Search',
        description: 'Lets the model run a web search on Anthropic\'s infrastructure.'
    }
];
