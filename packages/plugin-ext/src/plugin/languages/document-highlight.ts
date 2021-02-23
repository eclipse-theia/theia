/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { URI } from '@theia/core/shared/vscode-uri';
import * as theia from '@theia/plugin';
import { DocumentsExtImpl } from '../documents';
import * as types from '../types-impl';
import * as Converter from '../type-converters';
import { Position } from '../../common/plugin-api-rpc';
import { DocumentHighlight } from '../../common/plugin-api-rpc-model';

export class DocumentHighlightAdapter {

    constructor(
        private readonly provider: theia.DocumentHighlightProvider,
        private readonly documents: DocumentsExtImpl) {
    }

    provideDocumentHighlights(resource: URI, position: Position, token: theia.CancellationToken): Promise<DocumentHighlight[] | undefined> {
        const documentData = this.documents.getDocumentData(resource);
        if (!documentData) {
            return Promise.reject(new Error(`There is no document for ${resource}`));
        }

        const document = documentData.document;
        const zeroBasedPosition = Converter.toPosition(position);

        return Promise.resolve(this.provider.provideDocumentHighlights(document, zeroBasedPosition, token)).then(documentHighlights => {
            if (!documentHighlights) {
                return undefined;
            }

            if (this.isDocumentHighlightArray(documentHighlights)) {
                const highlights: DocumentHighlight[] = [];

                for (const highlight of documentHighlights) {
                    highlights.push(Converter.fromDocumentHighlight(highlight));
                }

                return highlights;
            }
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private isDocumentHighlightArray(array: any): array is types.DocumentHighlight[] {
        return Array.isArray(array) && array.length > 0 && array[0] instanceof types.DocumentHighlight;
    }
}
