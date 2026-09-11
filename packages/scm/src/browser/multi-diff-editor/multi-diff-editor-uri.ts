// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { isObject, URI } from '@theia/core';

export interface MultiDiffEditorResourcePair {
    originalUri: URI;
    modifiedUri: URI;
}

export interface MultiDiffEditorUriData {
    title: string;
    resources: MultiDiffEditorResourcePair[];
}

export namespace MultiDiffEditorUri {

    const SCHEME = 'multi-diff-editor';

    export function isMultiDiffEditorUri(uri: URI): boolean {
        return uri.scheme === SCHEME;
    }

    export function encode(data: MultiDiffEditorUriData): URI {
        const payload = JSON.stringify({
            title: data.title,
            resources: data.resources.map(r => [r.originalUri.toString(), r.modifiedUri.toString()])
        });
        return new URI().withScheme(SCHEME).withQuery(payload);
    }

    export function decode(uri: URI): MultiDiffEditorUriData {
        if (uri.scheme !== SCHEME) {
            throw new Error(`The URI must have scheme ${SCHEME}. The URI was: ${uri}`);
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(uri.query);
        } catch {
            throw new Error(`The URI ${uri} is not a valid URI for scheme ${SCHEME}: query is not valid JSON`);
        }
        if (!isValidPayload(parsed)) {
            throw new Error(`The URI ${uri} is not a valid URI for scheme ${SCHEME}`);
        }
        return {
            title: parsed.title,
            resources: parsed.resources.map(pair => ({
                originalUri: new URI(pair[0]),
                modifiedUri: new URI(pair[1])
            }))
        };
    }

    interface ParsedPayload {
        title: string;
        resources: [string, string][];
    }

    function isValidPayload(value: unknown): value is ParsedPayload {
        if (!isObject<ParsedPayload>(value)) {
            return false;
        }
        if (typeof value.title !== 'string' || !Array.isArray(value.resources)) {
            return false;
        }
        return value.resources.every(pair =>
            Array.isArray(pair) && pair.length === 2 && pair.every(s => typeof s === 'string')
        );
    }
}
