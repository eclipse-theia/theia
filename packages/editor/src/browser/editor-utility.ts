/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import URI from "@theia/core/lib/common/uri";

export interface DiffUris {
    original: string;
    modified: string;
}
export namespace DiffUris {
    export function is(o: object) {
        return 'original' in o && 'modified' in o;
    }
}

export namespace DiffUriHelper {

    export function encode(original: URI, modified: URI): URI {
        const diffUris: DiffUris = {
            original: original.toString(),
            modified: modified.toString()
        };

        const diffUriStr = encodeURI(JSON.stringify(diffUris));

        return new URI(original.displayName).withScheme('diff').withFragment(diffUriStr);
    }

    export function decode(uri: URI): DiffUris {
        if (uri.scheme !== 'diff') {
            throw ('URI must have scheme "diff".');
        }
        const diffUris = JSON.parse(decodeURI(uri.fragment));
        return diffUris;
    }

    export function isDiffUri(uri: URI): boolean {
        return uri.scheme === 'diff';
    }

}
