/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import URI from "@theia/core/lib/common/uri";

export namespace PreviewUri {
    export const id = 'code-editor-preview';
    export const param = 'open-handler=' + id;
    export function match(uri: URI): boolean {
        return uri.query.indexOf(param) !== -1;
    }
    export function encode(uri: URI): URI {
        if (match(uri)) {
            return uri;
        }
        const query = [param, ...uri.query.split('&')].join('&');
        return uri.withQuery(query);
    }
    export function decode(uri: URI): URI {
        if (!match(uri)) {
            return uri;
        }
        const query = uri.query.split('&').filter(p => p !== param).join('&');
        return uri.withQuery(query);
    }
}
