// *****************************************************************************
// Copyright (C) 2025 EclispeSource GmbH and others.
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
import { SyncReferenceCollection, Reference, ResourceResolver, Resource, Event, Emitter, URI } from '@theia/core';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';

@injectable()
/** For creating highly configurable in-memory resources */
export class ConfigurableInMemoryResources implements ResourceResolver {

    protected readonly resources = new SyncReferenceCollection<string, ConfigurableMutableResource>(uri => new ConfigurableMutableResource(new URI(uri)));

    get onWillDispose(): Event<ConfigurableMutableResource> {
        return this.resources.onWillDispose;
    }

    add(uri: URI, options: ResourceInitializationOptions): ConfigurableMutableReferenceResource {
        const resourceUri = uri.toString();
        if (this.resources.has(resourceUri)) {
            throw new Error(`Cannot add already existing in-memory resource '${resourceUri}'`);
        }
        const resource = this.acquire(resourceUri);
        resource.update(options);
        return resource;
    }

    update(uri: URI, options: ResourceInitializationOptions): Resource {
        const resourceUri = uri.toString();
        const resource = this.resources.get(resourceUri);
        if (!resource) {
            throw new Error(`Cannot update non-existent in-memory resource '${resourceUri}'`);
        }
        resource.update(options);
        return resource;
    }

    resolve(uri: URI): ConfigurableMutableReferenceResource {
        const uriString = uri.toString();
        if (!this.resources.has(uriString)) {
            throw new Error(`In memory '${uriString}' resource does not exist.`);
        }
        return this.acquire(uriString);
    }

    protected acquire(uri: string): ConfigurableMutableReferenceResource {
        const reference = this.resources.acquire(uri);
        return new ConfigurableMutableReferenceResource(reference);
    }
}

export type ResourceInitializationOptions = Pick<Resource, 'autosaveable' | 'initiallyDirty' | 'readOnly'>
    & { contents?: string | Promise<string>, onSave?: Resource['saveContents'] };

export class ConfigurableMutableResource implements Resource {
    protected readonly onDidChangeContentsEmitter = new Emitter<void>();
    readonly onDidChangeContents = this.onDidChangeContentsEmitter.event;
    protected fireDidChangeContents(): void {
        this.onDidChangeContentsEmitter.fire();
    }

    protected readonly onDidChangeReadonlyEmitter = new Emitter<boolean | MarkdownString>();
    readonly onDidChangeReadOnly = this.onDidChangeReadonlyEmitter.event;

    constructor(readonly uri: URI, protected options?: ResourceInitializationOptions) { }

    get readOnly(): Resource['readOnly'] {
        return this.options?.readOnly;
    }

    get autosaveable(): boolean {
        return this.options?.autosaveable !== false;
    }

    get initiallyDirty(): boolean {
        return !!this.options?.initiallyDirty;
    }

    get contents(): string | Promise<string> {
        return this.options?.contents ?? '';
    }

    readContents(): Promise<string> {
        return Promise.resolve(this.options?.contents ?? '');
    }

    async saveContents(contents: string): Promise<void> {
        await this.options?.onSave?.(contents);
        this.update({ contents });
    }

    update(options: ResourceInitializationOptions): void {
        const didContentsChange = 'contents' in options && options.contents !== this.options?.contents;
        const didReadOnlyChange = 'readOnly' in options && options.readOnly !== this.options?.readOnly;
        this.options = { ...this.options, ...options };
        if (didContentsChange) {
            this.onDidChangeContentsEmitter.fire();
        }
        if (didReadOnlyChange) {
            this.onDidChangeReadonlyEmitter.fire(this.readOnly ?? false);
        }
    }

    dispose(): void {
        this.onDidChangeContentsEmitter.dispose();
    }
}

export class ConfigurableMutableReferenceResource implements Resource {
    constructor(protected reference: Reference<ConfigurableMutableResource>) { }

    get uri(): URI {
        return this.reference.object.uri;
    }

    get onDidChangeContents(): Event<void> {
        return this.reference.object.onDidChangeContents;
    }

    dispose(): void {
        this.reference.dispose();
    }

    readContents(): Promise<string> {
        return this.reference.object.readContents();
    }

    saveContents(contents: string): Promise<void> {
        return this.reference.object.saveContents(contents);
    }

    update(options: ResourceInitializationOptions): void {
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

    get contents(): string | Promise<string> {
        return this.reference.object.contents;
    }
}
