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
export namespace Schemes {
    export const FILE = 'file';
    export const UNTITLED = 'untitled';
    export const HTTP: string = 'http';
    export const HTTPS: string = 'https';
    export const MAILTO: string = 'mailto';
    export const DATA: string = 'data';
    /**
     * A schema is used for models that exist in memory
     * only and that have no correspondence on a server or such.
     */
    export const IN_MEMORY: string = 'inmemory';
    /** A schema is used for settings files. */
    export const VSCODE: string = 'vscode';
    /** A schema is used for internal private files. */
    export const INTERNAL: string = 'private';
    export const COMMAND: string = 'command';
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
