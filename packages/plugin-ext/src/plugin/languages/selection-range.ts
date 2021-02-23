/********************************************************************************
 * Copyright (C) 2020 Red Hat, Inc. and others.
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

// copied and modified from https://github.com/microsoft/vscode/blob/standalone/0.19.x/src/vs/workbench/api/common/extHostLanguageFeatures.ts#L1107-L1151

import * as theia from '@theia/plugin';
import { DocumentsExtImpl } from '../documents';
import { URI } from '@theia/core/shared/vscode-uri';
import * as model from '../../common/plugin-api-rpc-model';
import * as Converter from '../type-converters';
import * as types from '../types-impl';

export class SelectionRangeProviderAdapter {

    constructor(
        private readonly provider: theia.SelectionRangeProvider,
        private readonly documents: DocumentsExtImpl
    ) { }

    provideSelectionRanges(resource: URI, position: monaco.IPosition[], token: theia.CancellationToken): Promise<model.SelectionRange[][]> {
        const documentData = this.documents.getDocumentData(resource);

        if (!documentData) {
            return Promise.reject(new Error(`There are no document for  ${resource}`));
        }

        const document = documentData.document;
        const positions = position.map(pos => Converter.toPosition(pos));

        return Promise.resolve(this.provider.provideSelectionRanges(document, positions, token)).then(allProviderRanges => {
            if (!Array.isArray(allProviderRanges) || allProviderRanges.length === 0) {
                return [];
            }

            if (allProviderRanges.length !== positions.length) {
                return [];
            }

            const allResults: model.SelectionRange[][] = [];
            for (let i = 0; i < positions.length; i++) {
                const oneResult: model.SelectionRange[] = [];
                allResults.push(oneResult);

                let last: types.Position | theia.Range = positions[i];
                let selectionRange = allProviderRanges[i];

                while (true) {
                    if (!selectionRange.range.contains(last)) {
                        return Promise.reject(new Error('INVALID selection range, must contain the previous range'));
                    }
                    oneResult.push(Converter.fromSelectionRange(selectionRange));
                    if (!selectionRange.parent) {
                        break;
                    }
                    last = selectionRange.range;
                    selectionRange = selectionRange.parent;
                }
            }
            return allResults;
        });
    }
}
