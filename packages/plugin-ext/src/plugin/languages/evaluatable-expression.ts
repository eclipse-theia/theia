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
import { Position } from '../../common/plugin-api-rpc';
import { EvaluatableExpression } from '../../common/plugin-api-rpc-model';
import { DocumentsExtImpl } from '../documents';
import * as Converter from '../type-converters';

export class EvaluatableExpressionAdapter {

    constructor(
        private readonly provider: theia.EvaluatableExpressionProvider,
        private readonly documents: DocumentsExtImpl
    ) { }

    async provideEvaluatableExpression(resource: URI, position: Position, token: theia.CancellationToken): Promise<EvaluatableExpression | undefined> {
        const documentData = this.documents.getDocumentData(resource);
        if (!documentData) {
            return Promise.reject(new Error(`There is no document data for ${resource}`));
        }

        const document = documentData.document;
        const pos = Converter.toPosition(position);

        return Promise.resolve(this.provider.provideEvaluatableExpression(document, pos, token)).then(expression => {
            if (!expression) {
                return undefined;
            }
            return Converter.fromEvaluatableExpression(expression);
        });
    }
}
