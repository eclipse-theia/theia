/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import URI from './uri';

export interface UriSelection {
    readonly uri: URI
}

export namespace UriSelection {

    export function is(arg: Object | undefined): arg is UriSelection {
        // tslint:disable-next-line:no-any
        return typeof arg === 'object' && ('uri' in arg) && (<any>arg)['uri'] instanceof URI;
    }

    export function getUri(selection: Object | undefined): URI | undefined {
        if (is(selection)) {
            return selection.uri;
        }
        if (Array.isArray(selection) && is(selection[0])) {
            return selection[0].uri;
        }
        return undefined;
    }

    export function getUris(selection: Object | undefined): URI[] {
        if (is(selection)) {
            return [selection.uri];
        }
        if (Array.isArray(selection)) {
            return selection.filter(is).map(s => s.uri);
        }
        return [];
    }

}
