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

import { MutableResource, Reference, ReferenceMutableResource, Resource, ResourceResolver, URI } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';

export const CHANGE_SET_FILE_RESOURCE_SCHEME = 'changeset-file';
export type ResourceInitializationOptions = Pick<Resource, 'autosaveable' | 'initiallyDirty' | 'readOnly'> & { contents?: string, onSave?: Resource['saveContents'] };
export type ResourceUpdateOptions = Pick<ResourceInitializationOptions, 'contents' | 'onSave'>;

export function createChangeSetFileUri(chatSessionId: string, elementUri: URI): URI {
    return elementUri.withScheme(CHANGE_SET_FILE_RESOURCE_SCHEME).withAuthority(chatSessionId);
}

export class UpdatableReferenceResource extends ReferenceMutableResource {
    static acquire(resource: UpdatableReferenceResource): UpdatableReferenceResource {
        DisposableRefCounter.acquire(resource.reference);
        return resource;
    }

    constructor(protected override reference: DisposableRefCounter<DisposableMutableResource>) {
        super(reference);
    }

    update(options: ResourceUpdateOptions): void {
        this.reference.object.update(options);
    }

    get readOnly(): Resource['readOnly'] {
        return this.reference.object.readOnly;
    }

    get initiallyDirty(): boolean {
        return this.reference.object.initiallyDirty;
    }

    get autosaveable(): boolean {
        return this.reference.object.autosaveable;
    }
}

export class DisposableMutableResource extends MutableResource {
    onSave: Resource['saveContents'] | undefined;
    constructor(uri: URI, protected readonly options?: ResourceInitializationOptions) {
        super(uri);
        this.onSave = options?.onSave;
        this.contents = options?.contents ?? '';
    }

    get readOnly(): Resource['readOnly'] {
        return this.options?.readOnly || !this.onSave;
    }

    get autosaveable(): boolean {
        return this.options?.autosaveable !== false;
    }

    get initiallyDirty(): boolean {
        return !!this.options?.initiallyDirty;
    }

    override async saveContents(contents: string): Promise<void> {
        if (this.options?.onSave) {
            await this.options.onSave(contents);
            this.update({ contents });
        }
    }

    update(options: ResourceUpdateOptions): void {
        if (options.contents !== undefined && options.contents !== this.contents) {
            this.contents = options.contents;
            this.fireDidChangeContents();
        }
        if ('onSave' in options && options.onSave !== this.onSave) {
            this.onSave = options.onSave;
        }
    }

    override dispose(): void {
        this.onDidChangeContentsEmitter.dispose();
    }
}

export class DisposableRefCounter<V = unknown> implements Reference<V> {
    static acquire<V>(item: DisposableRefCounter<V>): DisposableRefCounter<V> {
        item.refs++;
        return item;
    }
    static create<V>(value: V, onDispose: () => void): DisposableRefCounter<V> {
        return this.acquire(new this(value, onDispose));
    }
    readonly object: V;
    protected refs = 0;
    protected constructor(value: V, protected readonly onDispose: () => void) {
        this.object = value;
    }
    dispose(): void {
        this.refs--;
        if (this.refs === 0) {
            this.onDispose();
        }
    }
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
