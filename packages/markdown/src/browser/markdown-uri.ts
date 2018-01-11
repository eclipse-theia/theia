/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import URI from "@theia/core/lib/common/uri";

@injectable()
export class MarkdownUri {
    public static schemePrefix = 'markdown.';
    from(markdownUri: URI): URI {
        const scheme = markdownUri.scheme;
        if (!scheme.startsWith(MarkdownUri.schemePrefix)) {
            throw new Error('The given URI is not a markdown URI, ' + markdownUri);
        }
        return markdownUri.withScheme(scheme.substr(MarkdownUri.schemePrefix.length));
    }
    to(uri: URI): URI {
        if (uri.path.ext !== '.md') {
            throw new Error('The given URI is not a markdown URI, ' + uri);
        }
        return uri.withScheme(MarkdownUri.schemePrefix + uri.scheme);
    }
}
