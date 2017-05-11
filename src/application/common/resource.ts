/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ExtensionProvider } from './extension-provider';
import { injectable, inject, named } from "inversify";
import URI from "../common/uri";

export interface Resource {
    readonly uri: URI;
    readContents(options?: { encoding?: string }): Promise<string>;
    saveContents?(content: string, options?: { encoding?: string }): Promise<void>;
}

export const ResourceResolver = Symbol('ResourceResolver');
export interface ResourceResolver {
    /**
     * Reject if a resource cannot be provided.
     */
    resolve(uri: URI): Promise<Resource>;
}

export const ResourceProvider = Symbol('ResourceProvider');
export type ResourceProvider = (uri: URI) => Promise<Resource>;

@injectable()
export class DefaultResourceProvider {

    constructor(
        @inject(ExtensionProvider) @named(ResourceResolver)
        protected readonly resolversProvider: ExtensionProvider<ResourceResolver>
    ) { }

    /**
     * Reject if a resource cannot be provided.
     */
    get(uri: URI): Promise<Resource> {
        const resolvers = this.resolversProvider.getExtensions()
        if (!resolvers) {
            return Promise.reject(this.createNotRegisteredError(uri));
        }
        const initial = resolvers[0].resolve(uri);
        return resolvers.slice(1).reduce((current, provider) =>
            current.catch(() =>
                provider.resolve(uri)
            ),
            initial
        ).catch(reason => !!reason ? reason : this.createNotRegisteredError(uri));
    }

    protected createNotRegisteredError(uri: URI): any {
        return `A resource provider for '${uri.toString()}' is not registered.`;
    }

}
