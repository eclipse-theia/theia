/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Resource } from "../../application/common";
import URI from "../../application/common/uri";
import { ILanguageClient } from "../../languages/browser";
import { ClassFileContentsRequest } from "./java-protocol";

export class JavaResource implements Resource {

    constructor(
        public uri: URI,
        protected readonly resolveLanguageClient: () => Promise<ILanguageClient>
    ) { }

    readContents(options: { encoding?: string }): Promise<string> {
        const uri = this.uri.toString();
        return this.resolveLanguageClient().then(languageClient =>
            languageClient.sendRequest(ClassFileContentsRequest.type, { uri }).then(content =>
                content || ''
            )
        );
    }

}
