/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import Uri from 'vscode-uri';

export default class URI {

    private codeUri: Uri;

    constructor(uri: string | Uri) {
        if (uri instanceof Uri) {
            this.codeUri = uri
        } else {
            this.codeUri = Uri.parse(uri)
        }
    }

    get parent(): URI {
        let str = this.codeUri.toString()
        return new URI(str.substr(0, str.lastIndexOf('/')))
    }

    get lastSegment(): string {
        let path = this.path
        let idx = path.lastIndexOf('/')
        if (idx === -1) {
            return path
        } else {
            return path.substr(idx + 1)
        }
    }

    append(toAppend: string): URI {
        if (!toAppend) {
            return this;
        }
        return new URI(this.toString() + "/" + toAppend);
    }

    get path(): string {
        return decodeURIComponent(this.codeUri.path)
    }

    toString() {
        return this.codeUri.toString();
    }

    get scheme(): string {
        return this.codeUri.scheme
    }

}