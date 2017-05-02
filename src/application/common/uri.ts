/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import Uri from 'vscode-uri';

export default class URI {

    private _raw: string | Uri;
    private _uri: string | undefined;
    private _codeUri: Uri | undefined;

    constructor(uri: string | Uri | undefined) {
        if (!uri) {
            throw new Error('The \'uri\' argument should be specified.');
        }
        this._raw = uri;
    }

    get codeUri(): Uri {
        if (this._codeUri === undefined) {
            this._codeUri = typeof this._raw === 'string' ? Uri.parse(this._raw) : this._raw;
        }
        return this._codeUri;
    }

    protected get uri(): string {
        if (this._uri === undefined) {
            this._uri = this.codeUri.toString();
        }
        return this._uri;
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

}