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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import { DebugProtocol } from '@vscode/debugprotocol';
import { injectable, postConstruct, inject } from '@theia/core/shared/inversify';
import { Disposable, DisposableCollection, nls } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { MonacoEditorZoneWidget } from '@theia/monaco/lib/browser/monaco-editor-zone-widget';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { DebugEditor } from './debug-editor';
import { DebugSourceBreakpoint } from '../model/debug-source-breakpoint';
import { Dimension } from '@theia/editor/lib/browser';
import * as monaco from '@theia/monaco-editor-core';
import { LanguageSelector } from '@theia/monaco-editor-core/esm/vs/editor/common/languageSelector';
import { provideSuggestionItems, CompletionOptions } from '@theia/monaco-editor-core/esm/vs/editor/contrib/suggest/browser/suggest';
import { IDecorationOptions } from '@theia/monaco-editor-core/esm/vs/editor/common/editorCommon';
import { StandaloneCodeEditor } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneCodeEditor';
import { CompletionItemKind, CompletionContext } from '@theia/monaco-editor-core/esm/vs/editor/common/languages';
import { ILanguageFeaturesService } from '@theia/monaco-editor-core/esm/vs/editor/common/services/languageFeatures';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { TextModel } from '@theia/monaco-editor-core/esm/vs/editor/common/model/textModel';
import { SelectComponent, SelectOption } from '@theia/core/lib/browser/widgets/select-component';

export type ShowDebugBreakpointOptions = DebugSourceBreakpoint | {
    position: monaco.Position,
    context: DebugBreakpointWidget.Context
} | {
    breakpoint: DebugSourceBreakpoint,
    context: DebugBreakpointWidget.Context
};

@injectable()
export class DebugBreakpointWidget implements Disposable {

    @inject(DebugEditor)
    readonly editor: DebugEditor;

    @inject(MonacoEditorProvider)
    protected readonly editorProvider: MonacoEditorProvider;

    protected selectNode: HTMLDivElement;
    protected selectNodeRoot: Root;

    protected zone: MonacoEditorZoneWidget;

    protected readonly toDispose = new DisposableCollection();

    protected context: DebugBreakpointWidget.Context = 'condition';
    protected _values: {
        [context in DebugBreakpointWidget.Context]?: string
    } = {};
    get values(): {
        [context in DebugBreakpointWidget.Context]?: string
    } | undefined {
        if (!this._input) {
            return undefined;
        }
        return {
            ...this._values,
            [this.context]: this._input.getControl().getValue()
        };
    }

    protected _input: MonacoEditor | undefined;
    get input(): MonacoEditor | undefined {
        return this._input;
    }
    // eslint-disable-next-line no-null/no-null
    set inputSize(dimension: Dimension | null) {
        if (this._input) {
            if (dimension) {
                this._input.setSize(dimension);
            } else {
                this._input.resizeToFit();
            }
        }
    }

    @postConstruct()
    protected async init(): Promise<void> {
        this.toDispose.push(this.zone = new MonacoEditorZoneWidget(this.editor.getControl()));
        this.zone.containerNode.classList.add('theia-debug-breakpoint-widget');

        const selectNode = this.selectNode = document.createElement('div');
        selectNode.classList.add('theia-debug-breakpoint-select');
        this.zone.containerNode.appendChild(selectNode);
        this.selectNodeRoot = createRoot(this.selectNode);
        this.toDispose.push(Disposable.create(() => this.selectNodeRoot.unmount()));

        const inputNode = document.createElement('div');
        inputNode.classList.add('theia-debug-breakpoint-input');
        this.zone.containerNode.appendChild(inputNode);

        const input = this._input = await this.createInput(inputNode);
        if (this.toDispose.disposed) {
            input.dispose();
            return;
        }
        this.toDispose.push(input);
        this.toDispose.push((monaco.languages.registerCompletionItemProvider as (languageId: LanguageSelector, provider: monaco.languages.CompletionItemProvider) => Disposable)
            ({ scheme: input.uri.scheme }, {
                provideCompletionItems: async (model, position, context, token): Promise<monaco.languages.CompletionList> => {
                    const suggestions: monaco.languages.CompletionItem[] = [];
                    if ((this.context === 'condition' || this.context === 'logMessage')
                        && input.uri.toString() === model.uri.toString()) {
                        const editor = this.editor.getControl();
                        const completions = await provideSuggestionItems(
                            StandaloneServices.get(ILanguageFeaturesService).completionProvider,
                            editor.getModel()! as unknown as TextModel,
                            new monaco.Position(editor.getPosition()!.lineNumber, 1),
                            new CompletionOptions(undefined, new Set<CompletionItemKind>().add(CompletionItemKind.Snippet)),
                            context as unknown as CompletionContext, token);
                        let overwriteBefore = 0;
                        if (this.context === 'condition') {
                            overwriteBefore = position.column - 1;
                        } else {
                            // Inside the curly brackets, need to count how many useful characters are behind the position so they would all be taken into account
                            const value = editor.getModel()!.getValue();
                            while ((position.column - 2 - overwriteBefore >= 0)
                                && value[position.column - 2 - overwriteBefore] !== '{' && value[position.column - 2 - overwriteBefore] !== ' ') {
                                overwriteBefore++;
                            }
                        }
                        for (const { completion } of completions.items) {
                            completion.range = monaco.Range.fromPositions(position.delta(0, -overwriteBefore), position);
                            suggestions.push(completion as unknown as monaco.languages.CompletionItem);
                        }
                    }
                    return { suggestions };
                }
            }));
        this.toDispose.push(this.zone.onDidLayoutChange(dimension => this.layout(dimension)));
        this.toDispose.push(input.getControl().onDidChangeModelContent(() => {
            const heightInLines = input.getControl().getModel()!.getLineCount() + 1;
            this.zone.layout(heightInLines);
            this.updatePlaceholder();
        }));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    get position(): monaco.Position | undefined {
        const options = this.zone.options;
        return options && new monaco.Position(options.afterLineNumber, options.afterColumn || -1);
    }

    show(options: ShowDebugBreakpointOptions): void {
        if (!this._input) {
            return;
        }
        const breakpoint = options instanceof DebugSourceBreakpoint ? options : 'breakpoint' in options ? options.breakpoint : undefined;
        this._values = breakpoint ? {
            condition: breakpoint.condition,
            hitCondition: breakpoint.hitCondition,
            logMessage: breakpoint.logMessage
        } : {};
        if (options instanceof DebugSourceBreakpoint) {
            if (options.logMessage) {
                this.context = 'logMessage';
            } else if (options.hitCondition && !options.condition) {
                this.context = 'hitCondition';
            } else {
                this.context = 'condition';
            }
        } else {
            this.context = options.context;
        }
        this.render();
        const position = 'position' in options ? options.position : undefined;
        const afterLineNumber = breakpoint ? breakpoint.line : position!.lineNumber;
        const afterColumn = breakpoint ? breakpoint.column : position!.column;
        const editor = this._input.getControl();
        const heightInLines = editor.getModel()!.getLineCount() + 1;
        this.zone.show({ afterLineNumber, afterColumn, heightInLines, frameWidth: 1 });
        editor.setPosition(editor.getModel()!.getPositionAt(editor.getModel()!.getValueLength()));
        this._input.focus();
    }

    hide(): void {
        this.zone.hide();
        this.editor.focus();
    }

    protected layout(dimension: monaco.editor.IDimension): void {
        if (this._input) {
            this._input.getControl().layout(dimension);
        }
    }

    protected createInput(node: HTMLElement): Promise<MonacoEditor> {
        return this.editorProvider.createInline(new URI().withScheme('breakpointinput').withPath(this.editor.getControl().getId()), node, {
            autoSizing: false
        });
    }

    protected render(): void {
        if (this._input) {
            this._input.getControl().setValue(this._values[this.context] || '');
        }
        this.selectNodeRoot.render(<SelectComponent
            defaultValue={this.context} onChange={this.updateInput}
            options={[
                { value: 'condition', label: nls.localizeByDefault('Expression') },
                { value: 'hitCondition', label: nls.localizeByDefault('Hit Count') },
                { value: 'logMessage', label: nls.localizeByDefault('Log Message') },
            ]}
        />);
    }

    protected readonly updateInput = (option: SelectOption) => {
        if (this._input) {
            this._values[this.context] = this._input.getControl().getValue();
        }
        this.context = option.value as DebugBreakpointWidget.Context;
        this.render();
        if (this._input) {
            this._input.focus();
        }
    };

    static PLACEHOLDER_DECORATION = 'placeholderDecoration';
    protected updatePlaceholder(): void {
        if (!this._input) {
            return;
        }
        const value = this._input.getControl().getValue();
        const decorations: IDecorationOptions[] = !!value ? [] : [{
            range: {
                startLineNumber: 0,
                endLineNumber: 0,
                startColumn: 0,
                endColumn: 1
            },
            renderOptions: {
                after: {
                    contentText: this.placeholder,
                    opacity: '0.4'
                }
            }
        }];
        (this._input.getControl() as unknown as StandaloneCodeEditor)
            .setDecorationsByType('Debug breakpoint placeholder', DebugBreakpointWidget.PLACEHOLDER_DECORATION, decorations);
    }
    protected get placeholder(): string {
        if (this.context === 'logMessage') {
            return nls.localizeByDefault("Message to log when breakpoint is hit. Expressions within {} are interpolated. 'Enter' to accept, 'esc' to cancel.");
        }
        if (this.context === 'hitCondition') {
            return nls.localizeByDefault("Break when hit count condition is met. 'Enter' to accept, 'esc' to cancel.");
        }
        return nls.localizeByDefault("Break when expression evaluates to true. 'Enter' to accept, 'esc' to cancel.");
    }

}
export namespace DebugBreakpointWidget {
    export type Context = keyof Pick<DebugProtocol.SourceBreakpoint, 'condition' | 'hitCondition' | 'logMessage'>;
}
