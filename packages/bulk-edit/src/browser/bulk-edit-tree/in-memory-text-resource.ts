/********************************************************************************
 * Copyright (c) 2021 SAP SE or an SAP affiliate company and others.
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
import URI from '@theia/core/lib/common/uri';
import { Resource, ResourceResolver } from '@theia/core/lib/common';
import { MaybePromise } from '@theia/core';

export const MEMORY_TEXT = 'mem-txt';

/**
 * Resource implementation for 'mem-txt' URI scheme where content is saved in URI query.
 */
export class InMemoryTextResource implements Resource {
    constructor(readonly uri: URI) { }

    async readContents(options?: { encoding?: string | undefined; } | undefined): Promise<string> {
        return this.uri.query || '';
    }
    dispose(): void { }
}

/**
 * ResourceResolver implementation for 'mem-txt' URI scheme.
 */
@injectable()
export class InMemoryTextResourceResolver implements ResourceResolver {
    resolve(uri: URI): MaybePromise<Resource> {
        if (uri.scheme !== MEMORY_TEXT) {
            throw new Error(`Expected a URI with ${MEMORY_TEXT} scheme. Was: ${uri}.`);
        }
        return new InMemoryTextResource(uri);
    }
}
