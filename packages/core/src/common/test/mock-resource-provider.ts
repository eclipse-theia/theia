/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
import URI from "../../common/uri";
import { Resource } from '../resource';

@injectable()
export class MockResourceProvider {

    constructor() { }

    async get(uri: URI): Promise<Resource> {
        return await {
            uri: new URI(''),
            dispose() { },
            readContents(options?: { encoding?: string }): Promise<string> { return Promise.resolve(""); }
        };
    }
}
