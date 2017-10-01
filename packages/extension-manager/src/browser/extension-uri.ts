/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import URI from "@theia/core/lib/common/uri";

export namespace ExtensionUri {
    export const scheme = 'extension';
    export function toUri(extensionName: string): URI {
        return new URI('').withScheme(scheme).withFragment(extensionName);
    }
    export function toExtensionName(uri: URI): string {
        if (uri.scheme === scheme) {
            return uri.fragment;
        }
        throw new Error('The given uri is not an extension URI, uri: ' + uri);
    }
}
