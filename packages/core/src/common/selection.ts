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

    // tslint:disable-next-line:no-any
    export function is(arg: any): arg is UriSelection {
        return !!arg && arg['uri'] instanceof URI;
    }

    // tslint:disable-next-line:no-any
    export function getUri(selection: any): URI | undefined {
        if (UriSelection.is(selection)) {
            return selection.uri;
        }
        return undefined;
    }

}
