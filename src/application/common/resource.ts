/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, multiInject } from "inversify";
import URI from "../common/uri";

export interface Resource {
    readonly uri: URI;
    readContents(options?: { encoding?: string }): Promise<string>;
    saveContents?(content: string, options?: { encoding?: string }): Promise<void>;
}

export const ResourceProvider = Symbol('ResourceProvider');
export interface ResourceProvider {
    /**
     * Reject if a resource cannot be provided.
     */
    get(uri: URI): Promise<Resource>;
}

@injectable()
export class ResourceService {

    constructor(
        @multiInject(ResourceProvider) protected readonly providers: ResourceProvider[]
    ) { }

    /**
     * Reject if a resource cannot be provided.
     */
    get(uri: URI): Promise<Resource> {
        if (this.providers.length === 0) {
            return Promise.reject(this.createHandlerNotRegisteredError(uri));
        }
        const initial = this.providers[0].get(uri);
        return this.providers.slice(1).reduce((current, provider) =>
            current.catch(() => provider.get(uri)),
            initial
        ).catch(reason => !!reason ? reason : this.createHandlerNotRegisteredError(uri));
    }

    protected createHandlerNotRegisteredError(uri: URI): any {
        return `A resource provider for '${uri.toString()}' is not registered.`;
    }

}
