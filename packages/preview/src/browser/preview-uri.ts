// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import URI from '@theia/core/lib/common/uri';

export namespace PreviewUri {
    export const id = 'code-editor-preview';
    export const param = 'open-handler=' + id;
    export function match(uri: URI): boolean {
        return uri.query.indexOf(param) !== -1;
    }
    export function encode(uri: URI): URI {
        if (match(uri)) {
            return uri;
        }
        const params = [param];
        if (uri.query) {
            params.push(...uri.query.split('&'));
        }
        const query = params.join('&');
        return uri.withQuery(query);
    }
    export function decode(uri: URI): URI {
        if (!match(uri)) {
            return uri;
        }
        const query = uri.query.split('&').filter(p => p !== param).join('&');
        return uri.withQuery(query);
    }
}
