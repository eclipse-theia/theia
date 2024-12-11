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

import { CancellationToken, ContributionProvider, Prioritizeable, RecursivePartial, URI } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { EditorOpenerOptions, EditorWidget, Range } from '@theia/editor/lib/browser';

import { EditorPreviewManager } from '@theia/editor-preview/lib/browser/editor-preview-manager';
import { DocumentSymbol } from '@theia/monaco-editor-core/esm/vs/editor/common/languages';
import { TextModel } from '@theia/monaco-editor-core/esm/vs/editor/common/model/textModel';
import { ILanguageFeaturesService } from '@theia/monaco-editor-core/esm/vs/editor/common/services/languageFeatures';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { MonacoToProtocolConverter } from '@theia/monaco/lib/browser/monaco-to-protocol-converter';

/** Regex to match GitHub-style position and range declaration with line (L) and column (C) */
export const LOCATION_REGEX = /#L(\d+)?(?:C(\d+))?(?:-L(\d+)?(?:C(\d+))?)?$/;

export const AIEditorSelectionResolver = Symbol('AIEditorSelectionResolver');
export interface AIEditorSelectionResolver {
    /**
     * The priority of the resolver. A higher value resolver will be called before others.
     */
    priority?: number;
    resolveSelection(widget: EditorWidget, options: EditorOpenerOptions, uri?: URI): Promise<RecursivePartial<Range> | undefined>
}

@injectable()
export class GitHubSelectionResolver implements AIEditorSelectionResolver {
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
export class TypeDocSymbolSelectionResolver implements AIEditorSelectionResolver {
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
export class TextFragmentSelectionResolver implements AIEditorSelectionResolver {
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

@injectable()
export class AIEditorManager extends EditorPreviewManager {
    @inject(ContributionProvider) @named(AIEditorSelectionResolver)
    protected readonly resolvers: ContributionProvider<AIEditorSelectionResolver>;

    protected override async revealSelection(widget: EditorWidget, options: EditorOpenerOptions = {}, uri?: URI): Promise<void> {
        if (!options.selection) {
            options.selection = await this.resolveSelection(options, widget, uri);
        }
        super.revealSelection(widget, options, uri);
    }

    protected async resolveSelection(options: EditorOpenerOptions, widget: EditorWidget, uri: URI | undefined): Promise<RecursivePartial<Range> | undefined> {
        if (!options.selection) {
            const orderedResolvers = Prioritizeable.prioritizeAllSync(this.resolvers.getContributions(), resolver => resolver.priority ?? 1);
            for (const linkResolver of orderedResolvers) {
                try {
                    const selection = await linkResolver.value.resolveSelection(widget, options, uri);
                    if (selection) {
                        return selection;
                    }
                } catch (error) {
                    console.error(error);
                }
            }
        }
        return undefined;
    }
}
