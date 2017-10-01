/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import URI from "@theia/core/lib/common/uri";

export namespace DiffUris {

    export function encode(left: URI, right: URI, name?: string): URI {
        const diffUris = [
            left.toString(),
            right.toString()
        ];

        const diffUriStr = JSON.stringify(diffUris);

        return new URI(name || left.displayName).withScheme('diff').withFragment(diffUriStr);
    }

    export function decode(uri: URI): URI[] {
        if (uri.scheme !== 'diff') {
            throw ('URI must have scheme "diff".');
        }
        const diffUris: string[] = JSON.parse(uri.fragment);
        return diffUris.map(s => new URI(s));
    }

    export function isDiffUri(uri: URI): boolean {
        return uri.scheme === 'diff';
    }

}
