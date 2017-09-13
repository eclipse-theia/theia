/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, named } from "inversify";
import URI from "../common/uri";
import { ContributionProvider } from './contribution-provider';
import { Event } from "./event";
import { Disposable } from "./disposable";
import { MaybePromise } from "./types";

export interface Resource extends Disposable {
    readonly uri: URI;
    readContents(options?: { encoding?: string }): Promise<string>;
    saveContents?(content: string, options?: { encoding?: string }): Promise<void>;
    readonly onDidChangeContents?: Event<void>;
}

export const ResourceResolver = Symbol('ResourceResolver');
export interface ResourceResolver {
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
        return Promise.reject(`A resource provider for '${uri.toString()}' is not registered.`);
    }

}
