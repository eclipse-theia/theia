/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/
/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

/* eslint-disable @typescript-eslint/no-explicit-any */

import { visit } from 'jsonc-parser';
import URI from '@theia/core/lib/common/uri';

monaco.languages.register({
    id: 'jsonc',
    'aliases': [
        'JSON with Comments'
    ],
    'filenames': [
        'launch.json'
    ]
});

monaco.languages.registerDocumentSymbolProvider('jsonc', {
    provideDocumentSymbols(model: monaco.editor.ITextModel): monaco.languages.DocumentSymbol[] {
        if (new URI(model.uri.toString()).path.base !== 'launch.json') {
            return [];
        }
        const children: monaco.languages.DocumentSymbol[] = [];
        const result: monaco.languages.DocumentSymbol = {
            name: 'Launch Configurations',
            detail: '',
            kind: monaco.languages.SymbolKind.Object,
            range: new monaco.Range(0, 0, 0, 0),
            selectionRange: new monaco.Range(0, 0, 0, 0),
            children,
            tags: []
        };
        let name: string = '';
        let lastProperty = '';
        let startOffset = 0;
        let depthInObjects = 0;

        visit(model.getValue(), {
            onObjectProperty: (property, _offset, _length) => {
                lastProperty = property;
            },
            onLiteralValue: (value: any, _offset: number, _length: number) => {
                if (lastProperty === 'name') {
                    name = value;
                }
            },
            onObjectBegin: (offset: number, _length: number) => {
                depthInObjects++;
                if (depthInObjects === 2) {
                    startOffset = offset;
                }
            },
            onObjectEnd: (offset: number, _length: number) => {
                if (name && depthInObjects === 2) {
                    const range = monaco.Range.fromPositions(model.getPositionAt(startOffset), model.getPositionAt(offset));
                    children.push({
                        name,
                        detail: '',
                        kind: monaco.languages.SymbolKind.Object,
                        range,
                        selectionRange: range,
                        tags: []
                    });
                }
                depthInObjects--;
            },
        });

        return [result];
    }
});
