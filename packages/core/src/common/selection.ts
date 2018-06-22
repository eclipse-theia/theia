/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import URI from './uri';

export interface UriSelection {
    readonly uri: URI
}

export namespace UriSelection {

    export function is(arg: Object | undefined): arg is UriSelection {
        // tslint:disable-next-line:no-any
        return typeof arg === 'object' && ('uri' in arg) && (<any>arg)['uri'] instanceof URI;
    }

    export function getUri(selection: Object | undefined): URI | undefined {
        if (is(selection)) {
            return selection.uri;
        }
        if (Array.isArray(selection) && is(selection[0])) {
            return selection[0].uri;
        }
        return undefined;
    }

    export function getUris(selection: Object | undefined): URI[] {
        if (is(selection)) {
            return [selection.uri];
        }
        if (Array.isArray(selection)) {
            return selection.filter(is).map(s => s.uri);
        }
        return [];
    }

}
