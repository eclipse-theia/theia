// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import { injectable, inject, named, postConstruct } from 'inversify';
import { TextDocumentContentChangeEvent } from 'vscode-languageserver-protocol';
import URI from '../common/uri';
import { ContributionProvider } from './contribution-provider';
import { Event, Emitter } from './event';
import { Disposable } from './disposable';
import { MaybePromise } from './types';
import { CancellationToken } from './cancellation';
import { ApplicationError } from './application-error';
import { ReadableStream, Readable } from './stream';
import { SyncReferenceCollection, Reference } from './reference';
import { MarkdownString } from './markdown-rendering';

export interface ResourceVersion {
}

export interface ResourceReadOptions {
    encoding?: string
}

export interface ResourceSaveOptions {
    encoding?: string
    overwriteEncoding?: boolean
    version?: ResourceVersion
}

export interface Resource extends Disposable {
    readonly uri: URI;
    /**
     * Latest read version of this resource.
     *
     * Optional if a resource does not support versioning, check with `in` operator`.
     * Undefined if a resource did not read content yet.
     */
    readonly version?: ResourceVersion | undefined;
    /**
     * Latest read encoding of this resource.
     *
     * Optional if a resource does not support encoding, check with `in` operator`.
     * Undefined if a resource did not read content yet.
     */
    readonly encoding?: string | undefined;

    readonly onDidChangeReadOnly?: Event<boolean | MarkdownString>;

    readonly readOnly?: boolean | MarkdownString;

    readonly initiallyDirty?: boolean;
    /** If false, the application should not attempt to auto-save this resource. */
    readonly autosaveable?: boolean;
    /**
     * Reads latest content of this resource.
     *
     * If a resource supports versioning it updates version to latest.
     * If a resource supports encoding it updates encoding to latest.
     *
     * @throws `ResourceError.NotFound` if a resource not found
     */
    readContents(options?: ResourceReadOptions): Promise<string>;
    /**
     * Stream latest content of this resource.
     *
     * If a resource supports versioning it updates version to latest.
     * If a resource supports encoding it updates encoding to latest.
     *
     * @throws `ResourceError.NotFound` if a resource not found
     */
    readStream?(options?: ResourceReadOptions): Promise<ReadableStream<string>>;
    /**
     * Rewrites the complete content for this resource.
     * If a resource does not exist it will be created.
     *
     * If a resource supports versioning clients can pass some version
     * to check against it, if it is not provided latest version is used.
     *
     * It updates version and encoding to latest.
     *
     * @throws `ResourceError.OutOfSync` if latest resource version is out of sync with the given
     */
    saveContents?(content: string, options?: ResourceSaveOptions): Promise<void>;
    /**
     * Rewrites the complete content for this resource.
     * If a resource does not exist it will be created.
     *
     * If a resource supports versioning clients can pass some version
     * to check against it, if it is not provided latest version is used.
     *
     * It updates version and encoding to latest.
     *
     * @throws `ResourceError.OutOfSync` if latest resource version is out of sync with the given
     */
    saveStream?(content: Readable<string>, options?: ResourceSaveOptions): Promise<void>;
    /**
     * Applies incremental content changes to this resource.
     *
     * If a resource supports versioning clients can pass some version
     * to check against it, if it is not provided latest version is used.
     * It updates version to latest.
     *
     * @throws `ResourceError.NotFound` if a resource not found or was not read yet
     * @throws `ResourceError.OutOfSync` if latest resource version is out of sync with the given
     */
    saveContentChanges?(changes: TextDocumentContentChangeEvent[], options?: ResourceSaveOptions): Promise<void>;
    readonly onDidChangeContents?: Event<void>;
    guessEncoding?(): Promise<string | undefined>
}
export namespace Resource {
    export interface SaveContext {
        contentLength: number
        content: string | Readable<string>
        changes?: TextDocumentContentChangeEvent[]
        options?: ResourceSaveOptions
    }
    export async function save(resource: Resource, context: SaveContext, token?: CancellationToken): Promise<void> {
        if (!resource.saveContents) {
            return;
        }
        if (await trySaveContentChanges(resource, context)) {
            return;
        }
        if (token && token.isCancellationRequested) {
            return;
        }
        if (typeof context.content !== 'string' && resource.saveStream) {
            await resource.saveStream(context.content, context.options);
        } else {
            const content = typeof context.content === 'string' ? context.content : Readable.toString(context.content);
            await resource.saveContents(content, context.options);
        }
    }
    export async function trySaveContentChanges(resource: Resource, context: SaveContext): Promise<boolean> {
        if (!context.changes || !resource.saveContentChanges || shouldSaveContent(resource, context)) {
            return false;
        }
        try {
            await resource.saveContentChanges(context.changes, context.options);
            return true;
        } catch (e) {
            if (!ResourceError.NotFound.is(e) && !ResourceError.OutOfSync.is(e)) {
                console.error(`Failed to apply incremental changes to '${resource.uri.toString()}':`, e);
            }
            return false;
        }
    }
    export function shouldSaveContent(resource: Resource, { contentLength, changes }: SaveContext): boolean {
        if (!changes || (resource.saveStream && contentLength > 32 * 1024 * 1024)) {
            return true;
        }
        let contentChangesLength = 0;
        for (const change of changes) {
            contentChangesLength += JSON.stringify(change).length;
            if (contentChangesLength > contentLength) {
                return true;
            }
        }
        return contentChangesLength > contentLength;
    }
}

export namespace ResourceError {
    export const NotFound = ApplicationError.declare(-40000, (raw: ApplicationError.Literal<{ uri: URI }>) => raw);
    export const OutOfSync = ApplicationError.declare(-40001, (raw: ApplicationError.Literal<{ uri: URI }>) => raw);
}

export const ResourceResolver = Symbol('ResourceResolver');
export interface ResourceResolver {
    /**
     * Resolvers will be ordered by descending priority.
     * Default: 0
     */
    priority?: number;
    /**
     * Reject if a resource cannot be provided.
     */
    resolve(uri: URI): MaybePromise<Resource>;
}

export const ResourceProvider = Symbol('ResourceProvider');
export type ResourceProvider = (uri: URI) => Promise<Resource>;

@injectable()
export class DefaultResourceProvider {

    constructor(
        @inject(ContributionProvider) @named(ResourceResolver)
        protected readonly resolversProvider: ContributionProvider<ResourceResolver>
    ) { }

    @postConstruct()
    init(): void {
        this.resolversProvider.getContributions().sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    }

    /**
     * Reject if a resource cannot be provided.
     */
    async get(uri: URI): Promise<Resource> {
        const resolvers = this.resolversProvider.getContributions();
        for (const resolver of resolvers) {
            try {
                return await resolver.resolve(uri);
            } catch (err) {
                // no-op
            }
        }
        return Promise.reject(new Error(`A resource provider for '${uri.toString()}' is not registered.`));
    }

}

export class MutableResource implements Resource {
    protected contents: string = '';

    constructor(readonly uri: URI) {
    }

    dispose(): void { }

    async readContents(): Promise<string> {
        return this.contents;
    }

    async saveContents(contents: string): Promise<void> {
        this.contents = contents;
        this.fireDidChangeContents();
    }

    protected readonly onDidChangeContentsEmitter = new Emitter<void>();
    readonly onDidChangeContents = this.onDidChangeContentsEmitter.event;
    protected fireDidChangeContents(): void {
        this.onDidChangeContentsEmitter.fire(undefined);
    }
}
export class ReferenceMutableResource implements Resource {
    constructor(protected reference: Reference<MutableResource>) { }

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
}

@injectable()
export class InMemoryResources implements ResourceResolver {

    protected readonly resources = new SyncReferenceCollection<string, MutableResource>(uri => new MutableResource(new URI(uri)));

    add(uri: URI, contents: string): Resource {
        const resourceUri = uri.toString();
        if (this.resources.has(resourceUri)) {
            throw new Error(`Cannot add already existing in-memory resource '${resourceUri}'`);
        }
        const resource = this.acquire(resourceUri);
        resource.saveContents(contents);
        return resource;
    }

    update(uri: URI, contents: string): Resource {
        const resourceUri = uri.toString();
        const resource = this.resources.get(resourceUri);
        if (!resource) {
            throw new Error(`Cannot update non-existent in-memory resource '${resourceUri}'`);
        }
        resource.saveContents(contents);
        return resource;
    }

    resolve(uri: URI): Resource {
        const uriString = uri.toString();
        if (!this.resources.has(uriString)) {
            throw new Error(`In memory '${uriString}' resource does not exist.`);
        }
        return this.acquire(uriString);
    }

    protected acquire(uri: string): ReferenceMutableResource {
        const reference = this.resources.acquire(uri);
        return new ReferenceMutableResource(reference);
    }
}

export const MEMORY_TEXT = 'mem-txt';

/**
 * Resource implementation for 'mem-txt' URI scheme where content is saved in URI query.
 */
export class InMemoryTextResource implements Resource {
    constructor(readonly uri: URI) { }

    async readContents(options?: { encoding?: string | undefined; } | undefined): Promise<string> {
        return this.uri.query;
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

export const UNTITLED_SCHEME = 'untitled';

let untitledResourceSequenceIndex = 0;

@injectable()
export class UntitledResourceResolver implements ResourceResolver {

    protected readonly resources = new Map<string, UntitledResource>();

    has(uri: URI): boolean {
        if (uri.scheme !== UNTITLED_SCHEME) {
            throw new Error('The given uri is not untitled file uri: ' + uri);
        } else {
            return this.resources.has(uri.toString());
        }
    }

    async resolve(uri: URI): Promise<UntitledResource> {
        if (uri.scheme !== UNTITLED_SCHEME) {
            throw new Error('The given uri is not untitled file uri: ' + uri);
        } else {
            const untitledResource = this.resources.get(uri.toString());
            if (!untitledResource) {
                return this.createUntitledResource('', '', uri);
            } else {
                return untitledResource;
            }
        }
    }

    async createUntitledResource(content?: string, extension?: string, uri?: URI, encoding?: string): Promise<UntitledResource> {
        if (!uri) {
            uri = this.createUntitledURI(extension);
        }
        return new UntitledResource(this.resources, uri, content, encoding);
    }

    createUntitledURI(extension?: string, parent?: URI): URI {
        let counter = 1; // vscode starts at 1
        let untitledUri;
        do {
            const name = `Untitled-${counter}${extension ?? ''}`;
            if (parent) {
                untitledUri = parent.resolve(name).withScheme(UNTITLED_SCHEME);
            }
            untitledUri = new URI().resolve(name).withScheme(UNTITLED_SCHEME);
            counter++;
        } while (this.has(untitledUri));
        return untitledUri;
    }
}

export class UntitledResource implements Resource {

    protected readonly onDidChangeContentsEmitter = new Emitter<void>();
    readonly initiallyDirty: boolean;
    readonly autosaveable = false;
    readonly encoding: string | undefined;
    get onDidChangeContents(): Event<void> {
        return this.onDidChangeContentsEmitter.event;
    }

    constructor(private resources: Map<string, UntitledResource>, public uri: URI, private content?: string, encoding?: string) {
        this.initiallyDirty = (content !== undefined && content.length > 0);
        this.resources.set(this.uri.toString(), this);
        this.encoding = encoding;
    }

    dispose(): void {
        this.resources.delete(this.uri.toString());
        this.onDidChangeContentsEmitter.dispose();
    }

    async readContents(options?: { encoding?: string | undefined; } | undefined): Promise<string> {
        if (this.content) {
            return this.content;
        } else {
            return '';
        }
    }

    async saveContents(content: string, options?: { encoding?: string, overwriteEncoding?: boolean }): Promise<void> {
        // This function must exist to ensure readOnly is false for the Monaco editor.
        // However it should not be called because saving 'untitled' is always processed as 'Save As'.
        throw Error('Untitled resources cannot be saved.');
    }

    protected fireDidChangeContents(): void {
        this.onDidChangeContentsEmitter.fire(undefined);
    }

    get version(): ResourceVersion | undefined {
        return undefined;
    }
}

/**
 * @deprecated Since 1.27.0. Please use `UntitledResourceResolver.createUntitledURI` instead.
 */
export function createUntitledURI(extension?: string, parent?: URI): URI {
    const name = `Untitled-${untitledResourceSequenceIndex++}${extension ?? ''}`;
    if (parent) {
        return parent.resolve(name).withScheme(UNTITLED_SCHEME);
    }
    return new URI().resolve(name).withScheme(UNTITLED_SCHEME);
}
