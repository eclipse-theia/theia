/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import URI from "@theia/core/lib/common/uri";
import { Resource, ResourceResolver } from '@theia/core/lib/common';
import { JAVA_SCHEME } from '../common';
import { ClassFileContentsRequest } from "./java-protocol";
import { JavaClientContribution } from "./java-client-contribution";

export class JavaResource implements Resource {

    constructor(
        public uri: URI,
        protected readonly clientContribution: JavaClientContribution
    ) { }

    dispose(): void {
    }

    readContents(options: { encoding?: string }): Promise<string> {
        const uri = this.uri.toString();
        return this.clientContribution.languageClient.then(languageClient =>
            languageClient.sendRequest(ClassFileContentsRequest.type, { uri }).then(content =>
                content || ''
            )
        );
    }

}

@injectable()
export class JavaResourceResolver implements ResourceResolver {

    constructor(
        @inject(JavaClientContribution)
        protected readonly clientContribution: JavaClientContribution
    ) { }

    resolve(uri: URI): JavaResource {
        if (uri.scheme !== JAVA_SCHEME) {
            throw new Error("The given URI is not a valid Java uri: " + uri);
        }
        return new JavaResource(uri, this.clientContribution);
    }

}
