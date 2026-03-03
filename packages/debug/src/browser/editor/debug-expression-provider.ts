// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and others. All rights reserved.
 *  Licensed under the MIT License. See https://github.com/Microsoft/vscode/blob/master/LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { injectable } from '@theia/core/shared/inversify';
import { ArrayUtils } from '@theia/core';
import * as monaco from '@theia/monaco-editor-core';
import { CancellationToken } from '@theia/monaco-editor-core/esm/vs/base/common/cancellation';
import { ILanguageFeaturesService } from '@theia/monaco-editor-core/esm/vs/editor/common/services/languageFeatures';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { DebugEditor } from './debug-editor';

/**
 * TODO: introduce a new request to LSP to look up an expression range: https://github.com/Microsoft/language-server-protocol/issues/462
 */
@injectable()
export class DebugExpressionProvider {

    async getEvaluatableExpression(
        editor: DebugEditor,
        selection: monaco.IRange
    ): Promise<{ matchingExpression: string; range: monaco.IRange } | undefined> {

        const pluginExpressionProvider = StandaloneServices.get(ILanguageFeaturesService).evaluatableExpressionProvider;
        const textEditorModel = editor.document.textEditorModel;

        if (pluginExpressionProvider && pluginExpressionProvider.has(textEditorModel)) {
            const registeredProviders = pluginExpressionProvider.ordered(textEditorModel);
            const position = new monaco.Position(selection.startLineNumber, selection.startColumn);

            const promises = registeredProviders.map(support =>
                Promise.resolve(support.provideEvaluatableExpression(textEditorModel, position, CancellationToken.None))
            );

            const results = await Promise.all(promises).then(ArrayUtils.coalesce);
            if (results.length > 0) {
                const range = results[0].range;
                const matchingExpression = results[0].expression || textEditorModel.getValueInRange(range);
                return { matchingExpression, range };
            }
        } else { // use fallback if no provider was registered
            const model = editor.getControl().getModel();
            if (model) {
                const lineContent = model.getLineContent(selection.startLineNumber);
                const { start, end } = this.getExactExpressionStartAndEnd(lineContent, selection.startColumn, selection.endColumn);
                const matchingExpression = lineContent.substring(start - 1, end - 1);
                const range = new monaco.Range(
                    selection.startLineNumber,
                    start,
                    selection.startLineNumber,
                    end
                );
                return { matchingExpression, range };
            }
        }
    }

    get(model: monaco.editor.IModel, selection: monaco.IRange): string {
        const lineContent = model.getLineContent(selection.startLineNumber);
        const { start, end } = this.getExactExpressionStartAndEnd(lineContent, selection.startColumn, selection.endColumn);
        return lineContent.substring(start - 1, end - 1);
    }
    protected getExactExpressionStartAndEnd(lineContent: string, looseStart: number, looseEnd: number): { start: number, end: number } {
        let matchingExpression: string | undefined = undefined;
        let startOffset = 1;

        // Some example supported expressions: myVar.prop, a.b.c.d, myVar?.prop, myVar->prop, MyClass::StaticProp, *myVar
        // Match any character except a set of characters which often break interesting sub-expressions
        const expression = /([^()\[\]{}<>\s+\-/%~#^;=|,`!]|\->)+/g;
        // eslint-disable-next-line no-null/no-null
        let result: RegExpExecArray | null = null;

        // First find the full expression under the cursor
        while (result = expression.exec(lineContent)) {
            const start = result.index + 1;
            const end = start + result[0].length;

            if (start <= looseStart && end >= looseEnd) {
                matchingExpression = result[0];
                startOffset = start;
                break;
            }
        }

        // If there are non-word characters after the cursor, we want to truncate the expression then.
        // For example in expression 'a.b.c.d', if the focus was under 'b', 'a.b' would be evaluated.
        if (matchingExpression) {
            const subExpression: RegExp = /\w+/g;
            // eslint-disable-next-line no-null/no-null
            let subExpressionResult: RegExpExecArray | null = null;
            while (subExpressionResult = subExpression.exec(matchingExpression)) {
                const subEnd = subExpressionResult.index + 1 + startOffset + subExpressionResult[0].length;
                if (subEnd >= looseEnd) {
                    break;
                }
            }

            if (subExpressionResult) {
                matchingExpression = matchingExpression.substring(0, subExpression.lastIndex);
            }
        }

        return matchingExpression ?
            { start: startOffset, end: startOffset + matchingExpression.length } :
            { start: 1, end: 1 };
    }
}
