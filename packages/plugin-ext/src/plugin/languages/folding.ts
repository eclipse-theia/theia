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

import * as theia from '@theia/plugin';
import { DocumentsExtImpl } from '../documents';
import { URI } from '@theia/core/shared/vscode-uri';
import * as Converter from '../type-converters';
import * as model from '../../common/plugin-api-rpc-model';

export class FoldingProviderAdapter {

    constructor(
        private readonly provider: theia.FoldingRangeProvider,
        private readonly documents: DocumentsExtImpl
    ) { }

    provideFoldingRanges(resource: URI, context: model.FoldingContext, token: theia.CancellationToken): Promise<model.FoldingRange[] | undefined> {
        const document = this.documents.getDocumentData(resource);
        if (!document) {
            return Promise.reject(new Error(`There are no document for ${resource}`));
        }

        const doc = document.document;

        return Promise.resolve(this.provider.provideFoldingRanges(doc, context, token)).then(ranges => {
            if (!Array.isArray(ranges)) {
                return undefined;
            }

            return ranges.map(Converter.fromFoldingRange);
        });
    }
}
