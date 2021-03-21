/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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

export namespace OutputUri {

    export const SCHEME = 'output';

    export function is(uri: string | URI): boolean {
        if (uri instanceof URI) {
            return uri.scheme === SCHEME;
        }
        return is(new URI(uri));
    }

    export function create(name: string): URI {
        if (!name) {
            throw new Error("'name' must be defined.");
        }
        if (!name.trim().length) {
            throw new Error("'name' must contain at least one non-whitespace character.");
        }
        return new URI(encodeURIComponent(name)).withScheme(SCHEME);
    }

    export function channelName(uri: string | URI): string {
        if (!is(uri)) {
            throw new Error(`Expected '${OutputUri.SCHEME}' URI scheme. Got: ${uri} instead.`);
        }
        return (uri instanceof URI ? uri : new URI(uri)).toString(true).slice(`${OutputUri.SCHEME}:/`.length);
    }

}
