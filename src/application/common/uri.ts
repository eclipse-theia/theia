/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import Uri from 'vscode-uri';

export default class URI {

    readonly codeUri: Uri;
    private readonly uri: string;

    constructor(uri: string | Uri | undefined) {
        if (!uri) {
            throw new Error(`The \'path\' argument should be specified.`);
        }
        this.codeUri = typeof uri === 'string' ? Uri.parse(uri) : uri;
        this.uri = this.codeUri.toString();
    }

    parent(): URI {
        return new URI(this.uri.substring(0, this.uri.lastIndexOf('/')));
    }

    lastSegment(): string {
        // TODO trim queries and fragments
        return this.uri.substr(this.uri.lastIndexOf('/') + 1);
    }

    append(...segments: string[]): URI {
        if (!segments || segments.length === 0) {
            return this;
        }
        const copy = segments.slice(0);
        copy.unshift(this.uri);
        return new URI(copy.join('/'));
    }

    path(): string {
        return this.codeUri.path;
    }

    toString() {
        return this.uri;
    }

    static toURI(input: string | Uri | URI): URI {
        return input instanceof URI ? input : new URI(input);
    }

}