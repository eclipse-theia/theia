/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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

// copied and modified from https://github.com/microsoft/vscode/blob/0eb3a02ca2bcfab5faa3dc6e52d7c079efafcab0/src/vs/workbench/api/common/extHostLanguageFeatures.ts#L692-L869

/* eslint-disable @typescript-eslint/consistent-type-definitions */

import { BinaryBuffer } from '@theia/core/src/common/buffer';
import * as theia from '@theia/plugin';
import { URI } from '@theia/core/shared/vscode-uri';
import { SemanticTokens, SemanticTokensEdit, SemanticTokensEdits } from '../types-impl';
import { DocumentsExtImpl } from '../documents';
import { toRange } from '../type-converters';
import { encodeSemanticTokensDto } from '../../common/semantic-tokens-dto';
import { Range } from '../../common/plugin-api-rpc-model';

class SemanticTokensPreviousResult {
    constructor(
        public readonly resultId: string | undefined,
        public readonly tokens?: Uint32Array,
    ) { }
}

type RelaxedSemanticTokens = { readonly resultId?: string; readonly data: number[]; };
type RelaxedSemanticTokensEdit = { readonly start: number; readonly deleteCount: number; readonly data?: number[]; };
type RelaxedSemanticTokensEdits = { readonly resultId?: string; readonly edits: RelaxedSemanticTokensEdit[]; };

type ProvidedSemanticTokens = theia.SemanticTokens | RelaxedSemanticTokens;
type ProvidedSemanticTokensEdits = theia.SemanticTokensEdits | RelaxedSemanticTokensEdits;

export class DocumentSemanticTokensAdapter {

    private readonly _previousResults: Map<number, SemanticTokensPreviousResult>;
    private _nextResultId = 1;

    constructor(
        private readonly _documents: DocumentsExtImpl,
        private readonly _provider: theia.DocumentSemanticTokensProvider,
    ) {
        this._previousResults = new Map<number, SemanticTokensPreviousResult>();
    }

    async provideDocumentSemanticTokens(resource: URI, previousResultId: number, token: theia.CancellationToken): Promise<BinaryBuffer | null> {
        const doc = this._documents.getDocument(resource);
        const previousResult = (previousResultId !== 0 ? this._previousResults.get(previousResultId) : null);
        let value: ProvidedSemanticTokens | ProvidedSemanticTokensEdits | null | undefined;
        if (previousResult && typeof previousResult.resultId === 'string' && typeof this._provider.provideDocumentSemanticTokensEdits === 'function') {
            value = await this._provider.provideDocumentSemanticTokensEdits(doc, previousResult.resultId, token);
        } else {
            value = await this._provider.provideDocumentSemanticTokens(doc, token);
        }
        if (previousResult) {
            this._previousResults.delete(previousResultId);
        }
        if (!value) {
            return null;
        }
        value = DocumentSemanticTokensAdapter._fixProvidedSemanticTokens(value);
        return this._send(DocumentSemanticTokensAdapter._convertToEdits(previousResult, value), value);
    }

    async releaseDocumentSemanticColoring(semanticColoringResultId: number): Promise<void> {
        this._previousResults.delete(semanticColoringResultId);
    }

    private static _fixProvidedSemanticTokens(v: ProvidedSemanticTokens | ProvidedSemanticTokensEdits): theia.SemanticTokens | theia.SemanticTokensEdits {
        if (DocumentSemanticTokensAdapter._isSemanticTokens(v)) {
            if (DocumentSemanticTokensAdapter._isCorrectSemanticTokens(v)) {
                return v;
            }
            return new SemanticTokens(new Uint32Array(v.data), v.resultId);
        } else if (DocumentSemanticTokensAdapter._isSemanticTokensEdits(v)) {
            if (DocumentSemanticTokensAdapter._isCorrectSemanticTokensEdits(v)) {
                return v;
            }
            return new SemanticTokensEdits(v.edits.map(edit => new SemanticTokensEdit(edit.start, edit.deleteCount, edit.data ?
                new Uint32Array(edit.data) : edit.data)), v.resultId);
        }
        return v;
    }

    private static _isSemanticTokens(v: ProvidedSemanticTokens | ProvidedSemanticTokensEdits): v is ProvidedSemanticTokens {
        return v && !!((v as ProvidedSemanticTokens).data);
    }

    private static _isCorrectSemanticTokens(v: ProvidedSemanticTokens): v is theia.SemanticTokens {
        return (v.data instanceof Uint32Array);
    }

    private static _isSemanticTokensEdits(v: ProvidedSemanticTokens | ProvidedSemanticTokensEdits): v is ProvidedSemanticTokensEdits {
        return v && Array.isArray((v as ProvidedSemanticTokensEdits).edits);
    }

    private static _isCorrectSemanticTokensEdits(v: ProvidedSemanticTokensEdits): v is theia.SemanticTokensEdits {
        for (const edit of v.edits) {
            if (!(edit.data instanceof Uint32Array)) {
                return false;
            }
        }
        return true;
    }

    private static _convertToEdits(previousResult: SemanticTokensPreviousResult | null | undefined, newResult: theia.SemanticTokens | theia.SemanticTokensEdits):
        theia.SemanticTokens | theia.SemanticTokensEdits {
        if (!DocumentSemanticTokensAdapter._isSemanticTokens(newResult)) {
            return newResult;
        }
        if (!previousResult || !previousResult.tokens) {
            return newResult;
        }
        const oldData = previousResult.tokens;
        const oldLength = oldData.length;
        const newData = newResult.data;
        const newLength = newData.length;

        let commonPrefixLength = 0;
        const maxCommonPrefixLength = Math.min(oldLength, newLength);
        while (commonPrefixLength < maxCommonPrefixLength && oldData[commonPrefixLength] === newData[commonPrefixLength]) {
            commonPrefixLength++;
        }

        if (commonPrefixLength === oldLength && commonPrefixLength === newLength) {
            // complete overlap!
            return new SemanticTokensEdits([], newResult.resultId);
        }

        let commonSuffixLength = 0;
        const maxCommonSuffixLength = maxCommonPrefixLength - commonPrefixLength;
        while (commonSuffixLength < maxCommonSuffixLength && oldData[oldLength - commonSuffixLength - 1] === newData[newLength - commonSuffixLength - 1]) {
            commonSuffixLength++;
        }

        return new SemanticTokensEdits([{
            start: commonPrefixLength,
            deleteCount: (oldLength - commonPrefixLength - commonSuffixLength),
            data: newData.subarray(commonPrefixLength, newLength - commonSuffixLength)
        }], newResult.resultId);
    }

    private _send(value: theia.SemanticTokens | theia.SemanticTokensEdits, original: theia.SemanticTokens | theia.SemanticTokensEdits): BinaryBuffer | null {
        if (DocumentSemanticTokensAdapter._isSemanticTokens(value)) {
            const myId = this._nextResultId++;
            this._previousResults.set(myId, new SemanticTokensPreviousResult(value.resultId, value.data));
            return encodeSemanticTokensDto({
                id: myId,
                type: 'full',
                data: value.data
            });
        }

        if (DocumentSemanticTokensAdapter._isSemanticTokensEdits(value)) {
            const myId = this._nextResultId++;
            if (DocumentSemanticTokensAdapter._isSemanticTokens(original)) {
                // store the original
                this._previousResults.set(myId, new SemanticTokensPreviousResult(original.resultId, original.data));
            } else {
                this._previousResults.set(myId, new SemanticTokensPreviousResult(value.resultId));
            }
            return encodeSemanticTokensDto({
                id: myId,
                type: 'delta',
                deltas: (value.edits || []).map(edit => ({ start: edit.start, deleteCount: edit.deleteCount, data: edit.data }))
            });
        }

        return null;
    }
}

export class DocumentRangeSemanticTokensAdapter {

    constructor(
        private readonly _documents: DocumentsExtImpl,
        private readonly _provider: theia.DocumentRangeSemanticTokensProvider,
    ) {
    }

    async provideDocumentRangeSemanticTokens(resource: URI, range: Range, token: theia.CancellationToken): Promise<BinaryBuffer | null> {
        const doc = this._documents.getDocument(resource);
        const value = await this._provider.provideDocumentRangeSemanticTokens(doc, toRange(range), token);
        if (!value) {
            return null;
        }
        return this._send(value);
    }

    private _send(value: theia.SemanticTokens): BinaryBuffer | null {
        return encodeSemanticTokensDto({
            id: 0,
            type: 'full',
            data: value.data
        });
    }
}
