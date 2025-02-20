// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { CancellationToken, RecursivePartial, URI } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { EditorOpenerOptions, EditorWidget, Range } from '@theia/editor/lib/browser';

import { EditorSelectionResolver } from '@theia/editor/lib/browser/editor-manager';
import { DocumentSymbol } from '@theia/monaco-editor-core/esm/vs/editor/common/languages';
import { TextModel } from '@theia/monaco-editor-core/esm/vs/editor/common/model/textModel';
import { ILanguageFeaturesService } from '@theia/monaco-editor-core/esm/vs/editor/common/services/languageFeatures';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { MonacoToProtocolConverter } from '@theia/monaco/lib/browser/monaco-to-protocol-converter';

/** Regex to match GitHub-style position and range declaration with line (L) and column (C) */
export const LOCATION_REGEX = /#L(\d+)?(?:C(\d+))?(?:-L(\d+)?(?:C(\d+))?)?$/;

@injectable()
export class GitHubSelectionResolver implements EditorSelectionResolver {
    priority = 100;

    async resolveSelection(widget: EditorWidget, options: EditorOpenerOptions, uri?: URI): Promise<RecursivePartial<Range> | undefined> {
        if (!uri) {
            return;
        }
        // We allow the GitHub syntax of selecting a range in markdown 'L1', 'L1-L2' 'L1-C1_L2-C2' (starting at line 1 and column 1)
        const match = uri?.toString().match(LOCATION_REGEX);
        if (!match) {
            return;
        }
        // we need to adapt the position information from one-based (in GitHub) to zero-based (in Theia)
        const startLine = match[1] ? parseInt(match[1], 10) - 1 : undefined;
        // if no start column is given, we assume the start of the line
        const startColumn = match[2] ? parseInt(match[2], 10) - 1 : 0;
        const endLine = match[3] ? parseInt(match[3], 10) - 1 : undefined;
        // if no end column is given, we assume the end of the line
        const endColumn = match[4] ? parseInt(match[4], 10) - 1 : endLine ? widget.editor.document.getLineMaxColumn(endLine) : undefined;

        return {
            start: { line: startLine, character: startColumn },
            end: { line: endLine, character: endColumn }
        };
    }
}

@injectable()
export class TypeDocSymbolSelectionResolver implements EditorSelectionResolver {
    priority = 50;

    @inject(MonacoToProtocolConverter) protected readonly m2p: MonacoToProtocolConverter;

    async resolveSelection(widget: EditorWidget, options: EditorOpenerOptions, uri?: URI): Promise<RecursivePartial<Range> | undefined> {
        if (!uri) {
            return;
        }
        const editor = MonacoEditor.get(widget);
        const monacoEditor = editor?.getControl();
        if (!monacoEditor) {
            return;
        }
        const symbolPath = this.findSymbolPath(uri);
        if (!symbolPath) {
            return;
        }
        const textModel = monacoEditor.getModel() as unknown as TextModel;
        if (!textModel) {
            return;
        }

        // try to find the symbol through the document symbol provider
        // support referencing nested symbols by separating a dot path similar to TypeDoc
        for (const provider of StandaloneServices.get(ILanguageFeaturesService).documentSymbolProvider.ordered(textModel)) {
            const symbols = await provider.provideDocumentSymbols(textModel, CancellationToken.None);
            const match = this.findSymbolByPath(symbols ?? [], symbolPath);
            if (match) {
                return this.m2p.asRange(match.selectionRange);
            }
        }
    }

    protected findSymbolPath(uri: URI): string[] | undefined {
        return uri.fragment.split('.');
    }

    protected findSymbolByPath(symbols: DocumentSymbol[], symbolPath: string[]): DocumentSymbol | undefined {
        if (!symbols || symbolPath.length === 0) {
            return undefined;
        }
        let matchedSymbol: DocumentSymbol | undefined = undefined;
        let currentSymbols = symbols;
        for (const part of symbolPath) {
            matchedSymbol = currentSymbols.find(symbol => symbol.name === part);
            if (!matchedSymbol) {
                return undefined;
            }
            currentSymbols = matchedSymbol.children || [];
        }
        return matchedSymbol;
    }
}

@injectable()
export class TextFragmentSelectionResolver implements EditorSelectionResolver {
    async resolveSelection(widget: EditorWidget, options: EditorOpenerOptions, uri?: URI): Promise<RecursivePartial<Range> | undefined> {
        if (!uri) {
            return;
        }
        const fragment = this.findFragment(uri);
        if (!fragment) {
            return;
        }
        const matches = widget.editor.document.findMatches?.({ isRegex: false, matchCase: false, matchWholeWord: false, searchString: fragment }) ?? [];
        if (matches.length > 0) {
            return {
                start: {
                    line: matches[0].range.start.line - 1,
                    character: matches[0].range.start.character - 1
                },
                end: {
                    line: matches[0].range.end.line - 1,
                    character: matches[0].range.end.character - 1
                }
            };
        }
    }

    protected findFragment(uri: URI): string | undefined {
        return uri.fragment;
    }
}
