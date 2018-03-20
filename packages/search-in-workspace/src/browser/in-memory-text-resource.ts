/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { ResourceResolver, Resource } from "@theia/core";
import URI from "@theia/core/lib/common/uri";

export const MEMORY_TEXT = "mem-txt";

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
