/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import Uri from 'vscode-uri';
import { Path } from "./path";

export default class URI {

    private readonly codeUri: Uri;
    private _path: Path | undefined;

    constructor(uri?: string | Uri) {
        if (uri === undefined) {
            this.codeUri = Uri.from({})
        } else if (uri instanceof Uri) {
            this.codeUri = uri
        } else {
            this.codeUri = Uri.parse(uri)
        }
    }

    get parent(): URI {
        return this.withPath(this.path.dir);
    }

    get lastSegment(): string {
        if (this.path.base) {
            return this.path.base;
        }
        if (this.path.root) {
            return Path.separator;
        }
        return '';
    }

    appendPath(toAppend: string): URI {
        return this.withPath(this.path.join(toAppend));
    }

    /**
     * return a new URI replacing the current with the given scheme
     */
    withScheme(scheme: string): URI {
        const newCodeUri = Uri.from({
            ...this.codeUri.toJSON(),
            scheme
        })
        return new URI(newCodeUri);
    }

    /**
     * return this URI without a scheme
     */
    withoutScheme(): URI {
        return this.withScheme('')
    }

    /**
     * return a new URI replacing the current with the given authority
     */
    withAuthority(authority: string): URI {
        const newCodeUri = Uri.from({
            ...this.codeUri.toJSON(),
            authority
        })
        return new URI(newCodeUri);
    }

    /**
     * return this URI without a authority
     */
    withoutAuthority(): URI {
        return this.withAuthority('')
    }

    /**
     * return a new URI replacing the current with the given path
     */
    withPath(path: string | Path): URI {
        const newCodeUri = Uri.from({
            ...this.codeUri.toJSON(),
            path: path.toString()
        })
        return new URI(newCodeUri);
    }

    /**
     * return this URI without a path
     */
    withoutPath(): URI {
        return this.withPath('')
    }

    /**
     * return a new URI replacing the current with the given query
     */
    withQuery(query: string): URI {
        const newCodeUri = Uri.from({
            ...this.codeUri.toJSON(),
            query
        })
        return new URI(newCodeUri);
    }

    /**
     * return this URI without a query
     */
    withoutQuery(): URI {
        return this.withQuery('')
    }

    /**
     * return a new URI replacing the current with the given fragment
     */
    withFragment(fragment: string): URI {
        const newCodeUri = Uri.from({
            ...this.codeUri.toJSON(),
            fragment
        })
        return new URI(newCodeUri);
    }

    /**
     * return this URI without a fragment
     */
    withoutFragment(): URI {
        return this.withFragment('')
    }

    get scheme(): string {
        return this.codeUri.scheme
    }

    get authority(): string {
        return this.codeUri.authority
    }

    get path(): Path {
        if (this._path === undefined) {
            this._path = new Path(this.codeUri.path);
        }
        return this._path;
    }

    get query(): string {
        return this.codeUri.query
    }

    get fragment(): string {
        return this.codeUri.fragment
    }

    toString(skipEncoding?: boolean) {
        return this.codeUri.toString(skipEncoding);
    }

}