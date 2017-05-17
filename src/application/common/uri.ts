/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import Uri from "vscode-uri";
import { isWindows } from "./os";

const slash: (path: string) => string = require("slash");
const fileScheme = "file://";

export default class URI {

    private codeUri: Uri;

    constructor(uri?: string | Uri) {
        if (uri === undefined) {
            this.codeUri = Uri.from({})
        } else if (uri instanceof Uri) {
            this.codeUri = uri
        } else {
            const idx = fileScheme.length;
            if (isWindows && uri.startsWith(fileScheme) && uri.charAt(idx) !== "/") {
                this.codeUri = Uri.parse(slash(uri.substring(0, idx) + "/" + uri.substring(idx)));
            } else {
                this.codeUri = Uri.parse(slash(uri))
            }
        }
    }

    get parent(): URI {
        let str = this.codeUri.toString()
        return new URI(str.substr(0, str.lastIndexOf("/")))
    }

    get lastSegment(): string {
        let path = this.path
        let idx = path.lastIndexOf("/")
        if (idx === -1) {
            return path
        } else {
            return path.substr(idx + 1)
        }
    }

    appendPath(toAppend: string): URI {
        if (!toAppend) {
            return this
        }
        return this.withPath(this.codeUri.path + "/" + toAppend)
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
        return this.withScheme("")
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
        return this.withAuthority("")
    }

    /**
     * return a new URI replacing the current with the given path
     */
    withPath(path: string): URI {
        const newCodeUri = Uri.from({
            ...this.codeUri.toJSON(),
            path
        })
        return new URI(newCodeUri);
    }

    /**
     * return this URI without a path
     */
    withoutPath(): URI {
        return this.withPath("")
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
        return this.withQuery("")
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
        return this.withFragment("")
    }

    get scheme(): string {
        return this.codeUri.scheme
    }

    get authority(): string {
        return this.codeUri.authority
    }

    /**
     * Platform independent path representation of the URI `as/the/following/format`.
     */
    get path(): string {
        return normalize(this.codeUri.fsPath)
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

function normalize(path: string) {
    return isWindows ? slash(path.replace(/\//g, '\\')) : path;
}