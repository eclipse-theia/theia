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

import { injectable } from '@theia/core/shared/inversify';
import { ResourceResolver, Resource } from '@theia/core';
import URI from '@theia/core/lib/common/uri';

export const MEMORY_TEXT = 'mem-txt';

export class InMemoryTextResource implements Resource {

    constructor(readonly uri: URI) { }

    async readContents(options?: { encoding?: string | undefined; } | undefined): Promise<string> {
        return this.uri.query;
    }

    dispose(): void { }
}

@injectable()
export class InMemoryTextResourceResolver implements ResourceResolver {
    resolve(uri: URI): Resource | Promise<Resource> {
        if (uri.scheme !== MEMORY_TEXT) {
            throw new Error(`Expected a URI with ${MEMORY_TEXT} scheme. Was: ${uri}.`);
        }
        return new InMemoryTextResource(uri);
    }
}
