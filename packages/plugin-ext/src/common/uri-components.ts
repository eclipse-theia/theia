/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import URI from '@theia/core/lib/common/uri';

export interface UriComponents {
    scheme: string;
    authority: string;
    path: string;
    query: string;
    fragment: string;
    external?: string;
}

// some well known URI schemas
// based on https://github.com/microsoft/vscode/blob/04c36be045a94fee58e5f8992d3e3fd980294a84/src/vs/base/common/network.ts#L9-L79
// TODO move to network.ts file
export namespace Schemes {

	/**
	 * A schema that is used for models that exist in memory
	 * only and that have no correspondence on a server or such.
	 */
    export const inMemory = 'inmemory';

	/**
	 * A schema that is used for setting files
	 */
    export const vscode = 'vscode';

	/**
	 * A schema that is used for internal private files
	 */
    export const internal = 'private';

	/**
	 * A walk-through document.
	 */
    export const walkThrough = 'walkThrough';

	/**
	 * An embedded code snippet.
	 */
    export const walkThroughSnippet = 'walkThroughSnippet';

    export const http = 'http';

    export const https = 'https';

    export const file = 'file';

    export const mailto = 'mailto';

    export const untitled = 'untitled';

    export const data = 'data';

    export const command = 'command';

    export const vscodeRemote = 'vscode-remote';

    export const vscodeRemoteResource = 'vscode-remote-resource';

    export const userData = 'vscode-userdata';

    export const vscodeCustomEditor = 'vscode-custom-editor';

    export const vscodeSettings = 'vscode-settings';

    export const webviewPanel = 'webview-panel';
}

export function theiaUritoUriComponents(uri: URI): UriComponents {
    return {
        scheme: uri.scheme,
        authority: uri.authority,
        path: uri.path.toString(),
        query: uri.query,
        fragment: uri.fragment
    };
}
