// *****************************************************************************
// Copyright (C) 2023 Mathieu Bussieres and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and others. All rights reserved.
 *  Licensed under the MIT License. See https://github.com/Microsoft/vscode/blob/master/LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// Copied from https://github.com/microsoft/vscode/blob/1.72.2/src/vs/base/common/marshalling.ts

import { VSBuffer } from './buffer';
import { regExpFlags } from '@theia/core/lib/common/strings';
import { URI } from '@theia/core/shared/vscode-uri';
import { UriComponents } from '@theia/core/lib/common/uri';
import { MarshalledId } from './marshalling-ids';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function stringify(obj: any): string {
    return JSON.stringify(obj, replacer);
}

export function parse(text: string): any {
    let data = JSON.parse(text);
    data = revive(data);
    return data;
}

export interface MarshalledObject {
    $mid: MarshalledId;
}

function replacer(key: string, value: any): any {
    // URI is done via toJSON-member
    if (value instanceof RegExp) {
        return {
            $mid: MarshalledId.Regexp,
            source: value.source,
            flags: regExpFlags(value),
        };
    }
    return value;
}

type Deserialize<T> = T extends UriComponents ? URI
    : T extends VSBuffer ? VSBuffer
    : T extends object
    ? Revived<T>
    : T;

export type Revived<T> = { [K in keyof T]: Deserialize<T[K]> };

export function revive<T = any>(obj: any, depth = 0): Revived<T> {
    if (!obj || depth > 200) {
        return obj;
    }

    if (typeof obj === 'object') {

        switch ((<MarshalledObject>obj).$mid) {
            case MarshalledId.Uri: return <any>URI.revive(obj);
            case MarshalledId.Regexp: return <any>new RegExp(obj.source, obj.flags);
            case MarshalledId.Date: return <any>new Date(obj.source);
        }

        if (
            obj instanceof VSBuffer
            || obj instanceof Uint8Array
        ) {
            return <any>obj;
        }

        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; ++i) {
                obj[i] = revive(obj[i], depth + 1);
            }
        } else {
            // walk object
            for (const key in obj) {
                if (Object.hasOwnProperty.call(obj, key)) {
                    obj[key] = revive(obj[key], depth + 1);
                }
            }
        }
    }

    return obj;
}
