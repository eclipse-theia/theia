// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics and others.
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
import { InlineValue, InlineValueContext, Range } from '../../common/plugin-api-rpc-model';
import { DocumentsExtImpl } from '../documents';
import * as Converter from '../type-converters';

export class InlineValuesAdapter {

    constructor(
        private readonly provider: theia.InlineValuesProvider,
        private readonly documents: DocumentsExtImpl
    ) { }

    async provideInlineValues(resource: URI, range: Range, context: InlineValueContext, token: theia.CancellationToken): Promise<InlineValue[] | undefined> {
        const documentData = this.documents.getDocumentData(resource);
        if (!documentData) {
            return Promise.reject(new Error(`There is no document data for ${resource}`));
        }

        const document = documentData.document;
        const viewPort = Converter.toRange(range);
        const ctx = Converter.toInlineValueContext(context);

        return Promise.resolve(this.provider.provideInlineValues(document, viewPort, ctx, token)).then(inlineValue => {
            if (!inlineValue) {
                return undefined;
            }
            if (Array.isArray(inlineValue)) {
                return inlineValue.map(iv => Converter.fromInlineValue(iv));
            }
            return undefined;
        });
    }
}
