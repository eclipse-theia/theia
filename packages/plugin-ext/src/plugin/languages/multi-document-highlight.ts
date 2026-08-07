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

import { URI } from '@theia/core/shared/vscode-uri';
import * as theia from '@theia/plugin';
import { DocumentsExtImpl } from '../documents';
import * as types from '../types-impl';
import * as Converter from '../type-converters';
import { Position } from '../../common/plugin-api-rpc';
import { MultiDocumentHighlightDto } from '../../common/plugin-api-rpc-model';
import { UriComponents } from '../../common/uri-components';

export class MultiDocumentHighlightAdapter {

    constructor(
        private readonly provider: theia.MultiDocumentHighlightProvider,
        private readonly documents: DocumentsExtImpl) {
    }

    provideMultiDocumentHighlights(
        resource: URI,
        position: Position,
        otherResources: UriComponents[],
        token: theia.CancellationToken
    ): Promise<MultiDocumentHighlightDto[] | undefined> {
        const documentData = this.documents.getDocumentData(resource);
        if (!documentData) {
            return Promise.reject(new Error(`There is no document for ${resource}`));
        }

        const document = documentData.document;
        const zeroBasedPosition = Converter.toPosition(position);

        const otherDocuments: theia.TextDocument[] = [];
        for (const otherResource of otherResources) {
            const otherUri = URI.revive(otherResource);
            const otherDocData = this.documents.getDocumentData(otherUri);
            if (otherDocData) {
                otherDocuments.push(otherDocData.document);
            }
        }

        return Promise.resolve(this.provider.provideMultiDocumentHighlights(document, zeroBasedPosition, otherDocuments, token)).then(result => {
            if (!result) {
                return undefined;
            }

            if (!this.isMultiDocumentHighlightArray(result)) {
                return undefined;
            }

            return result.map(multiHighlight => ({
                uri: multiHighlight.uri,
                highlights: multiHighlight.highlights.map(h => Converter.fromDocumentHighlight(h))
            }));
        });
    }

    private isMultiDocumentHighlightArray(array: unknown): array is types.MultiDocumentHighlight[] {
        return Array.isArray(array) && array.length > 0 && array[0] instanceof types.MultiDocumentHighlight;
    }
}
