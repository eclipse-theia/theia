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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// copied and modified from https://github.com/TypeFox/vscode/blob/70b8db24a37fafc77247de7f7cb5bb0195120ed0/src/vs/workbench/api/common/extHostLanguageFeatures.ts#L771

import { URI } from '@theia/core/shared/vscode-uri';
import * as theia from '@theia/plugin';
import { DocumentsExtImpl } from '../documents';
import * as Converter from '../type-converters';
import { Position } from '../../common/plugin-api-rpc';
import { SignatureHelp, SignatureHelpContext } from '../../common/plugin-api-rpc-model';

export class SignatureHelpAdapter {

    private idSequence = 1;
    private readonly cache = new Map<number, theia.SignatureHelp>();

    constructor(
        private readonly delegate: theia.SignatureHelpProvider,
        private readonly documents: DocumentsExtImpl) {

    }

    async provideSignatureHelp(resource: URI, position: Position, token: theia.CancellationToken, context: SignatureHelpContext): Promise<SignatureHelp | undefined> {
        const documentData = this.documents.getDocumentData(resource);
        if (!documentData) {
            return Promise.reject(new Error(`There are no document for  ${resource}`));
        }

        const document = documentData.document;
        const zeroBasedPosition = Converter.toPosition(position);
        const pluginHelpContext = this.reviveContext(context);

        const value = await this.delegate.provideSignatureHelp(document, zeroBasedPosition, token, pluginHelpContext);
        if (!value) {
            return undefined;
        }
        const id = this.idSequence++;
        this.cache.set(id, value);
        return Converter.SignatureHelp.from(id, value);
    }

    private reviveContext(context: SignatureHelpContext): theia.SignatureHelpContext {
        let activeSignatureHelp: theia.SignatureHelp | undefined = undefined;
        if (context.activeSignatureHelp) {
            const revivedSignatureHelp = Converter.SignatureHelp.to(context.activeSignatureHelp);
            const saved = typeof context.activeSignatureHelp.id === 'number' && this.cache.get(context.activeSignatureHelp.id);
            if (saved) {
                activeSignatureHelp = saved;
                activeSignatureHelp.activeSignature = revivedSignatureHelp.activeSignature;
                activeSignatureHelp.activeParameter = revivedSignatureHelp.activeParameter;
            } else {
                activeSignatureHelp = revivedSignatureHelp;
            }
        }
        return { ...context, activeSignatureHelp };
    }

    releaseSignatureHelp(id: number): void {
        this.cache.delete(id);
    }

}
