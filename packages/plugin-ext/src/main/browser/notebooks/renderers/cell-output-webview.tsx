// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from '@theia/core/shared/react';
import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import { generateUuid } from '@theia/core/lib/common/uuid';
import {
    NotebookRendererMessagingService, CellOutputWebview, NotebookRendererRegistry,
    NotebookEditorWidgetService, NotebookKernelService, NotebookEditorWidget,
    OutputRenderEvent,
    NotebookCellOutputsSplice,
    NotebookContentChangedEvent
} from '@theia/notebook/lib/browser';
import { WebviewWidget } from '../../webview/webview';
import { Message, WidgetManager } from '@theia/core/lib/browser';
import { outputWebviewPreload, PreloadContext } from './output-webview-internal';
import { WorkspaceTrustService } from '@theia/workspace/lib/browser';
import { CellsChangedMessage, CellsMoved, CellsSpliced, ChangePreferredMimetypeMessage, FromWebviewMessage, OutputChangedMessage } from './webview-communication';
import { Disposable, DisposableCollection, Emitter, QuickPickService, nls } from '@theia/core';
import { NotebookModel } from '@theia/notebook/lib/browser/view-model/notebook-model';
import { NotebookOptionsService, NotebookOutputOptions } from '@theia/notebook/lib/browser/service/notebook-options';
import { NotebookCellModel } from '@theia/notebook/lib/browser/view-model/notebook-cell-model';
import { NotebookCellsChangeType } from '@theia/notebook/lib/common';
import { NotebookCellOutputModel } from '@theia/notebook/lib/browser/view-model/notebook-cell-output-model';

export const AdditionalNotebookCellOutputCss = Symbol('AdditionalNotebookCellOutputCss');

export function createCellOutputWebviewContainer(ctx: interfaces.Container): interfaces.Container {
    const child = ctx.createChild();
    child.bind(AdditionalNotebookCellOutputCss).toConstantValue(DEFAULT_NOTEBOOK_OUTPUT_CSS);
    child.bind(CellOutputWebviewImpl).toSelf();
    return child;
}

// Should be kept up-to-date with:
// https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/notebook/browser/view/renderers/webviewThemeMapping.ts
const mapping: ReadonlyMap<string, string> = new Map([
    ['theme-font-family', 'vscode-font-family'],
    ['theme-font-weight', 'vscode-font-weight'],
    ['theme-font-size', 'vscode-font-size'],
    ['theme-code-font-family', 'vscode-editor-font-family'],
    ['theme-code-font-weight', 'vscode-editor-font-weight'],
    ['theme-code-font-size', 'vscode-editor-font-size'],
    ['theme-scrollbar-background', 'vscode-scrollbarSlider-background'],
    ['theme-scrollbar-hover-background', 'vscode-scrollbarSlider-hoverBackground'],
    ['theme-scrollbar-active-background', 'vscode-scrollbarSlider-activeBackground'],
    ['theme-quote-background', 'vscode-textBlockQuote-background'],
    ['theme-quote-border', 'vscode-textBlockQuote-border'],
    ['theme-code-foreground', 'vscode-textPreformat-foreground'],
    // Editor
    ['theme-background', 'vscode-editor-background'],
    ['theme-foreground', 'vscode-editor-foreground'],
    ['theme-ui-foreground', 'vscode-foreground'],
    ['theme-link', 'vscode-textLink-foreground'],
    ['theme-link-active', 'vscode-textLink-activeForeground'],
    // Buttons
    ['theme-button-background', 'vscode-button-background'],
    ['theme-button-hover-background', 'vscode-button-hoverBackground'],
    ['theme-button-foreground', 'vscode-button-foreground'],
    ['theme-button-secondary-background', 'vscode-button-secondaryBackground'],
    ['theme-button-secondary-hover-background', 'vscode-button-secondaryHoverBackground'],
    ['theme-button-secondary-foreground', 'vscode-button-secondaryForeground'],
    ['theme-button-hover-foreground', 'vscode-button-foreground'],
    ['theme-button-focus-foreground', 'vscode-button-foreground'],
    ['theme-button-secondary-hover-foreground', 'vscode-button-secondaryForeground'],
    ['theme-button-secondary-focus-foreground', 'vscode-button-secondaryForeground'],
    // Inputs
    ['theme-input-background', 'vscode-input-background'],
    ['theme-input-foreground', 'vscode-input-foreground'],
    ['theme-input-placeholder-foreground', 'vscode-input-placeholderForeground'],
    ['theme-input-focus-border-color', 'vscode-focusBorder'],
    // Menus
    ['theme-menu-background', 'vscode-menu-background'],
    ['theme-menu-foreground', 'vscode-menu-foreground'],
    ['theme-menu-hover-background', 'vscode-menu-selectionBackground'],
    ['theme-menu-focus-background', 'vscode-menu-selectionBackground'],
    ['theme-menu-hover-foreground', 'vscode-menu-selectionForeground'],
    ['theme-menu-focus-foreground', 'vscode-menu-selectionForeground'],
    // Errors
    ['theme-error-background', 'vscode-inputValidation-errorBackground'],
    ['theme-error-foreground', 'vscode-foreground'],
    ['theme-warning-background', 'vscode-inputValidation-warningBackground'],
    ['theme-warning-foreground', 'vscode-foreground'],
    ['theme-info-background', 'vscode-inputValidation-infoBackground'],
    ['theme-info-foreground', 'vscode-foreground'],
    // Notebook:
    ['theme-notebook-output-background', 'vscode-notebook-outputContainerBackgroundColor'],
    ['theme-notebook-output-border', 'vscode-notebook-outputContainerBorderColor'],
    ['theme-notebook-cell-selected-background', 'vscode-notebook-selectedCellBackground'],
    ['theme-notebook-symbol-highlight-background', 'vscode-notebook-symbolHighlightBackground'],
    ['theme-notebook-diff-removed-background', 'vscode-diffEditor-removedTextBackground'],
    ['theme-notebook-diff-inserted-background', 'vscode-diffEditor-insertedTextBackground'],
]);

const constants: Record<string, string> = {
    'theme-input-border-width': '1px',
    'theme-button-primary-hover-shadow': 'none',
    'theme-button-secondary-hover-shadow': 'none',
    'theme-input-border-color': 'transparent',
};

export const DEFAULT_NOTEBOOK_OUTPUT_CSS = `
:root {
    ${Array.from(mapping.entries()).map(([key, value]) => `--${key}: var(--${value});`).join('\n')}
    ${Object.entries(constants).map(([key, value]) => `--${key}: ${value};`).join('\n')}
}

body {
    padding: 0;
}

table {
    border-collapse: collapse;
    border-spacing: 0;
}
  
table th,
table td {
    border: 1px solid;
}

table > thead > tr > th {
    text-align: left;
    border-bottom: 1px solid;
}

table > thead > tr > th,
table > thead > tr > td,
table > tbody > tr > th,
table > tbody > tr > td {
    padding: 5px 10px;
}

table > tbody > tr + tr > td {
    border-top: 1px solid;
}

table,
thead,
tr,
th,
td,
tbody {
    border: none !important;
    border-color: transparent;
    border-spacing: 0;
    border-collapse: collapse;
}

table,
th,
tr {
    vertical-align: middle;
    text-align: right;
}

thead {
    font-weight: bold;
    background-color: rgba(130, 130, 130, 0.16);
}

th,
td {
    padding: 4px 8px;
}

tr:nth-child(even) {
    background-color: rgba(130, 130, 130, 0.08);
}

tbody th {
    font-weight: normal;
}
`;

interface CellOutputUpdate extends NotebookCellOutputsSplice {
    cellHandle: number
}

@injectable()
export class CellOutputWebviewImpl implements CellOutputWebview, Disposable {

    @inject(NotebookRendererMessagingService)
    protected readonly messagingService: NotebookRendererMessagingService;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(WorkspaceTrustService)
    protected readonly workspaceTrustService: WorkspaceTrustService;

    @inject(NotebookRendererRegistry)
    protected readonly notebookRendererRegistry: NotebookRendererRegistry;

    @inject(NotebookEditorWidgetService)
    protected readonly notebookEditorWidgetService: NotebookEditorWidgetService;

    @inject(NotebookKernelService)
    protected readonly notebookKernelService: NotebookKernelService;

    @inject(QuickPickService)
    protected readonly quickPickService: QuickPickService;

    @inject(AdditionalNotebookCellOutputCss)
    protected readonly additionalOutputCss: string;

    @inject(NotebookOptionsService)
    protected readonly notebookOptionsService: NotebookOptionsService;

    // returns the output Height
    protected readonly onDidRenderOutputEmitter = new Emitter<OutputRenderEvent>();
    readonly onDidRenderOutput = this.onDidRenderOutputEmitter.event;

    protected notebook: NotebookModel;

    protected options: NotebookOutputOptions;

    readonly id = generateUuid();

    protected editor: NotebookEditorWidget | undefined;

    protected element?: HTMLDivElement; // React.createRef<HTMLDivElement>();

    protected webviewWidget: WebviewWidget;

    protected toDispose = new DisposableCollection();

    protected isDisposed = false;

    async init(notebook: NotebookModel, editor: NotebookEditorWidget): Promise<void> {
        this.notebook = notebook;
        this.editor = editor;
        this.options = this.notebookOptionsService.computeOutputOptions();
        this.toDispose.push(this.notebookOptionsService.onDidChangeOutputOptions(options => {
            this.options = options;
            this.updateStyles();
        }));

        this.webviewWidget = await this.widgetManager.getOrCreateWidget(WebviewWidget.FACTORY_ID, { id: this.id });
        // this.webviewWidget.parent = this.editor ?? null;
        this.webviewWidget.setContentOptions({
            allowScripts: true,
            // eslint-disable-next-line max-len
            // list taken from https://github.com/microsoft/vscode/blob/a27099233b956dddc2536d4a0d714ab36266d897/src/vs/workbench/contrib/notebook/browser/view/renderers/backLayerWebView.ts#L762-L774
            enableCommandUris: [
                'github-issues.authNow',
                'workbench.extensions.search',
                'workbench.action.openSettings',
                '_notebook.selectKernel',
                'jupyter.viewOutput',
                'workbench.action.openLargeOutput',
                'cellOutput.enableScrolling',
            ],
        });
        this.webviewWidget.setHTML(await this.createWebviewContent());

        this.notebook.onDidAddOrRemoveCell(e => {
            if (e.newCellIds) {
                const newCells = e.newCellIds.map(id => this.notebook.cells.find(cell => cell.handle === id)).filter(cell => !!cell) as NotebookCellModel[];
                newCells.forEach(cell => this.attachCellAndOutputListeners(cell));
            }
        });
        this.notebook.cells.forEach(cell => this.attachCellAndOutputListeners(cell));

        if (this.editor) {
            this.toDispose.push(this.editor.onDidPostKernelMessage(message => {
                this.webviewWidget.sendMessage({
                    type: 'customKernelMessage',
                    message
                });
            }));

            this.toDispose.push(this.editor.onPostRendererMessage(messageObj => {
                this.webviewWidget.sendMessage({
                    type: 'customRendererMessage',
                    ...messageObj
                });
            }));

        }

        this.webviewWidget.onMessage((message: FromWebviewMessage) => {
            this.handleWebviewMessage(message);
        });
    }

    attachCellAndOutputListeners(cell: NotebookCellModel): void {
        this.toDispose.push(cell.onDidChangeOutputs(outputChange => this.updateOutputs([{
            newOutputs: outputChange.newOutputs,
            start: outputChange.start,
            deleteCount: outputChange.deleteCount,
            cellHandle: cell.handle
        }])));
        this.toDispose.push(cell.onDidChangeOutputItems(output => {
            const oldOutputIndex = cell.outputs.findIndex(o => o.outputId === output.outputId);
            this.updateOutputs([{
                cellHandle: cell.handle,
                newOutputs: [output],
                start: oldOutputIndex,
                deleteCount: 1
            }]);
        }));
        this.toDispose.push(cell.onDidCellHeightChange(height => this.setCellHeight(cell, height)));
        this.toDispose.push(cell.onDidChangeOutputVisibility(visible => {
            this.webviewWidget.sendMessage({
                type: 'outputVisibilityChanged',
                cellHandle: cell.handle,
                visible
            });
        }));
    }

    render(): React.JSX.Element {
        return <div className='theia-notebook-cell-output-webview' ref={element => {
            if (element) {
                this.element = element;
                this.attachWebview();
            }
        }}></div>;
    }

    attachWebview(): void {
        if (this.element) {
            this.webviewWidget.processMessage(new Message('before-attach'));
            this.element.appendChild(this.webviewWidget.node);
            this.webviewWidget.processMessage(new Message('after-attach'));
            this.webviewWidget.setIframeHeight(0);
        }
    }

    isAttached(): boolean {
        return this.element?.contains(this.webviewWidget.node) ?? false;
    }

    updateOutputs(updates: CellOutputUpdate[]): void {
        if (this.webviewWidget.isHidden) {
            this.webviewWidget.show();
        }

        const updateOutputMessage: OutputChangedMessage = {
            type: 'outputChanged',
            changes: updates.map(update => ({
                cellHandle: update.cellHandle,
                newOutputs: update.newOutputs.map(output => ({
                    id: output.outputId,
                    items: output.outputs.map(item => ({ mime: item.mime, data: item.data.buffer })),
                    metadata: output.metadata
                })),
                start: update.start,
                deleteCount: update.deleteCount
            }))
        };

        this.webviewWidget.sendMessage(updateOutputMessage);
    }

    cellsChanged(cellEvents: NotebookContentChangedEvent[]): void {
        const changes: Array<CellsMoved | CellsSpliced> = [];

        for (const event of cellEvents) {
            if (event.kind === NotebookCellsChangeType.Move) {
                changes.push(...event.cells.map((cell, i) => ({
                    type: 'cellMoved',
                    cellHandle: event.cells[0].handle,
                    toIndex: event.newIdx + i,
                } as CellsMoved)));
            } else if (event.kind === NotebookCellsChangeType.ModelChange) {
                changes.push(...event.changes.map(change => ({
                    type: 'cellsSpliced',
                    start: change.start,
                    deleteCount: change.deleteCount,
                    newCells: change.newItems.map(cell => cell.handle)
                } as CellsSpliced)));
            }
        }

        this.webviewWidget.sendMessage({
            type: 'cellsChanged',
            changes: changes.filter(e => e)
        } as CellsChangedMessage);
    }

    setCellHeight(cell: NotebookCellModel, height: number): void {
        if (!this.isDisposed) {
            this.webviewWidget.sendMessage({
                type: 'cellHeightUpdate',
                cellHandle: cell.handle,
                cellKind: cell.cellKind,
                height
            });
        }
    }

    async requestOutputPresentationUpdate(cellHandle: number, output: NotebookCellOutputModel): Promise<void> {
        const selectedMime = await this.quickPickService.show(
            output.outputs.map(item => ({ label: item.mime })),
            { description: nls.localizeByDefault('Select mimetype to render for current output') });
        if (selectedMime) {
            this.webviewWidget.sendMessage({
                type: 'changePreferredMimetype',
                cellHandle,
                outputId: output.outputId,
                mimeType: selectedMime.label
            } as ChangePreferredMimetypeMessage);
        }
    }

    protected handleWebviewMessage(message: FromWebviewMessage): void {
        if (!this.editor) {
            throw new Error('No editor found for cell output webview');
        }

        switch (message.type) {
            case 'initialized':
                this.updateOutputs(this.notebook.cells.map(cell => ({
                    cellHandle: cell.handle,
                    newOutputs: cell.outputs,
                    start: 0,
                    deleteCount: 0
                })));
                this.updateStyles();
                break;
            case 'customRendererMessage':
                this.messagingService.getScoped(this.editor.id).postMessage(message.rendererId, message.message);
                break;
            case 'didRenderOutput':
                this.webviewWidget.setIframeHeight(message.bodyHeight);
                this.onDidRenderOutputEmitter.fire({
                    cellHandle: message.cellHandle,
                    outputId: message.outputId,
                    outputHeight: message.outputHeight
                });
                break;
            case 'did-scroll-wheel':
                this.editor.node.getElementsByClassName('theia-notebook-viewport')[0].children[0].scrollBy(message.deltaX, message.deltaY);
                break;
            case 'customKernelMessage':
                this.editor.recieveKernelMessage(message.message);
                break;
            case 'inputFocusChanged':
                this.editor?.outputInputFocusChanged(message.focused);
                break;
            case 'cellFocusChanged':
                const selectedCell = this.notebook.getCellByHandle(message.cellHandle);
                if (selectedCell) {
                    this.notebook.setSelectedCell(selectedCell);
                }
                break;
            case 'cellHeightRequest':
                const cellHeight = this.notebook.getCellByHandle(message.cellHandle)?.cellHeight ?? 0;
                this.webviewWidget.sendMessage({
                    type: 'cellHeightUpdate',
                    cellHandle: message.cellHandle,
                    height: cellHeight
                });
                break;
            case 'bodyHeightChange':
                this.webviewWidget.setIframeHeight(message.height);
                break;
        }
    }

    getPreloads(): string[] {
        const kernel = this.notebookKernelService.getSelectedOrSuggestedKernel(this.notebook);
        const kernelPreloads = kernel?.preloadUris.map(uri => uri.toString()) ?? [];

        const staticPreloads = this.notebookRendererRegistry.staticNotebookPreloads
            .filter(preload => preload.type === this.notebook.viewType)
            .map(preload => preload.entrypoint);
        return kernelPreloads.concat(staticPreloads);
    }

    protected updateStyles(): void {
        this.webviewWidget.sendMessage({
            type: 'notebookStyles',
            styles: this.generateStyles()
        });
    }

    protected generateStyles(): { [key: string]: string } {
        return {
            'notebook-output-node-left-padding': `${this.options.outputNodeLeftPadding}px`,
            'notebook-cell-output-font-size': `${this.options.outputFontSize || this.options.fontSize}px`,
            'notebook-cell-output-line-height': `${this.options.outputLineHeight}px`,
            'notebook-cell-output-max-height': `${this.options.outputLineHeight * this.options.outputLineLimit}px`,
            'notebook-cell-output-font-family': this.options.outputFontFamily || this.options.fontFamily,
        };
    }

    private async createWebviewContent(): Promise<string> {
        const isWorkspaceTrusted = await this.workspaceTrustService.getWorkspaceTrust();
        const preloads = this.preloadsScriptString(isWorkspaceTrusted);
        const content = `
                <html>
                    <head>
                        <meta charset="UTF-8">
                        <style>
                            ${this.additionalOutputCss}
                        </style>
                    </head>
                    <body>
                        <script type="module">${preloads}</script>
                    </body>
                </html>
                `;
        return content;
    }

    private preloadsScriptString(isWorkspaceTrusted: boolean): string {
        const ctx: PreloadContext = {
            isWorkspaceTrusted,
            rendererData: this.notebookRendererRegistry.notebookRenderers,
            renderOptions: {
                lineLimit: this.options.outputLineLimit,
                outputScrolling: this.options.outputScrolling,
                outputWordWrap: this.options.outputWordWrap,
            },
            staticPreloadsData: this.getPreloads()
        };
        // TS will try compiling `import()` in webviewPreloads, so use a helper function instead
        // of using `import(...)` directly
        return `
            const __import = (x) => import(x);
                (${outputWebviewPreload})(JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(ctx))}")))`;
    }

    dispose(): void {
        this.isDisposed = true;
        this.toDispose.dispose();
    }
}
