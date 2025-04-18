// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { injectable } from '@theia/core/shared/inversify';
import { ResourceResolver, URI } from '@theia/core';
import {DisposableMutableResource, DisposableRefCounter, ResourceInitializationOptions, UpdatableReferenceResource} from '@theia/ai-core';
export {DisposableMutableResource, DisposableRefCounter, ResourceInitializationOptions, UpdatableReferenceResource};

export const CHANGE_SET_FILE_RESOURCE_SCHEME = 'changeset-file';

export function createChangeSetFileUri(chatSessionId: string, elementUri: URI): URI {
    return elementUri.withScheme(CHANGE_SET_FILE_RESOURCE_SCHEME).withAuthority(chatSessionId);
}

@injectable()
export class ChangeSetFileResourceResolver implements ResourceResolver {
    protected readonly cache = new Map<string, UpdatableReferenceResource>();

    add(uri: URI, options?: ResourceInitializationOptions): UpdatableReferenceResource {
        const key = uri.toString();
        if (this.cache.has(key)) {
            throw new Error(`Resource ${key} already exists.`);
        }
        const underlyingResource = new DisposableMutableResource(uri, options);
        const ref = DisposableRefCounter.create(underlyingResource, () => {
            underlyingResource.dispose();
            this.cache.delete(key);
        });
        const refResource = new UpdatableReferenceResource(ref);
        this.cache.set(key, refResource);
        return refResource;
    }

    tryGet(uri: URI): UpdatableReferenceResource | undefined {
        try {
            return this.resolve(uri);
        } catch {
            return undefined;
        }
    }

    update(uri: URI, contents: string): void {
        const key = uri.toString();
        const resource = this.cache.get(key);
        if (!resource) {
            throw new Error(`No resource for ${key}.`);
        }
        resource.update({ contents });
    }

    resolve(uri: URI): UpdatableReferenceResource {
        const key = uri.toString();
        const ref = this.cache.get(key);
        if (!ref) { throw new Error(`No resource for ${key}.`); }
        return UpdatableReferenceResource.acquire(ref);
    }
}
