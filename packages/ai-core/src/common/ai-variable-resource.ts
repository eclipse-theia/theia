// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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

import * as deepEqual from 'fast-deep-equal';
import { injectable, inject } from '@theia/core/shared/inversify';
import { Resource, ResourceResolver, Reference, URI, Emitter, Event, generateUuid } from '@theia/core';
import { AIVariableContext, AIVariableResolutionRequest, AIVariableService, ResolvedAIContextVariable } from './variable-service';
import stableJsonStringify = require('fast-json-stable-stringify');

export const AI_VARIABLE_RESOURCE_SCHEME = 'ai-variable';
export const NO_CONTEXT_AUTHORITY = 'context-free';

export type ResourceInitializationOptions = Pick<Resource, 'autosaveable' | 'initiallyDirty' | 'readOnly'>
    & { contents?: string | Promise<string>, onSave?: Resource['saveContents'] };
export type ResourceUpdateOptions = Pick<ResourceInitializationOptions, 'contents' | 'onSave'>;

export class UpdatableReferenceResource implements Resource {
    static acquire(resource: UpdatableReferenceResource): UpdatableReferenceResource {
        DisposableRefCounter.acquire(resource.reference);
        return resource;
    }

    constructor(protected reference: DisposableRefCounter<DisposableMutableResource>) { }

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

export class DisposableMutableResource implements Resource {
    protected onSave: Resource['saveContents'] | undefined;
    protected contents: string | Promise<string>;
    protected readonly onDidChangeContentsEmitter = new Emitter<void>();
    readonly onDidChangeContents = this.onDidChangeContentsEmitter.event;

    constructor(readonly uri: URI, protected readonly options?: ResourceInitializationOptions) {
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

    readContents(): Promise<string> {
        return Promise.resolve(this.contents);
    }

    async saveContents(contents: string): Promise<void> {
        if (this.options?.onSave) {
            await this.options.onSave(contents);
            this.update({ contents });
        }
    }

    update(options: ResourceUpdateOptions): void {
        if (options.contents !== undefined && options.contents !== this.contents) {
            this.contents = options.contents;
            this.onDidChangeContentsEmitter.fire();
        }
        if ('onSave' in options && options.onSave !== this.onSave) {
            this.onSave = options.onSave;
        }
    }

    dispose(): void {
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
export class AIVariableResourceResolver implements ResourceResolver {
    protected readonly cache = new Map<string, [UpdatableReferenceResource, AIVariableContext]>();
    @inject(AIVariableService) protected readonly variableService: AIVariableService;

    resolve(uri: URI): Resource {
        const existing = this.tryGet(uri);
        if (!existing) {
            throw new Error('Unknown URI');
        }
        return existing;
    }

    protected tryGet(uri: URI): UpdatableReferenceResource | undefined {
        const existing = this.cache.get(uri.toString());
        if (existing) {
            return UpdatableReferenceResource.acquire(existing[0]);
        }
    }

    get(request: AIVariableResolutionRequest, context: AIVariableContext): Resource {
        const uri = this.toUri(request, context);
        const existing = this.tryGet(uri);
        if (existing) { return existing; }
        const key = uri.toString();
        const underlying = new DisposableMutableResource(uri, { readOnly: true });
        const ref = DisposableRefCounter.create(underlying, () => {
            underlying.dispose();
            this.cache.delete(key);
        });
        const refResource = new UpdatableReferenceResource(ref);
        this.cache.set(key, [refResource, context]);
        this.variableService.resolveVariable(request, context)
            .then((value: ResolvedAIContextVariable) => value && refResource.update({ contents: value.contextValue || value.value }));
        return refResource;
    }

    protected toUri(request: AIVariableResolutionRequest, context: AIVariableContext): URI {
        return URI.fromComponents({
            scheme: AI_VARIABLE_RESOURCE_SCHEME,
            query: stableJsonStringify({ arg: request.arg, name: request.variable.name }),
            path: '/',
            authority: this.toAuthority(context),
            fragment: ''
        });
    }

    protected toAuthority(context: AIVariableContext): string {
        try {
            if (deepEqual(context, {})) { return NO_CONTEXT_AUTHORITY; }
            for (const [resource, cachedContext] of this.cache.values()) {
                if (deepEqual(context, cachedContext)) {
                    return resource.uri.authority;
                }
            }
        } catch (err) {
            // Mostly that deep equal could overflow the stack, but it should run into === or inequality before that.
            console.warn('Problem evaluating context in AIVariableResourceResolver', err);
        }
        return generateUuid();
    }

    fromUri(uri: URI): AIVariableResolutionRequest | undefined {
        if (uri.scheme !== AI_VARIABLE_RESOURCE_SCHEME) { return undefined; }
        try {
            const { name, arg } = JSON.parse(uri.query);
            if (!name) { return undefined; }
            const variable = this.variableService.getVariable(name);
            if (!variable) { return undefined; }
            return {
                variable,
                arg,
            };
        } catch { return undefined; }
    }
}
