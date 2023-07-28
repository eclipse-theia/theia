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
import { inject, injectable, interfaces, postConstruct } from '@theia/core/shared/inversify';
import { NotebookRendererMessagingService, CellOutputWebview, NotebookRendererRegistry, NotebookEditorWidgetService } from '@theia/notebook/lib/browser';
import { v4 } from 'uuid';
import { NotebookCellModel } from '@theia/notebook/lib/browser/view-model/notebook-cell-model';
import { WebviewWidget } from '../../webview/webview';
import { Message, WidgetManager } from '@theia/core/lib/browser';
import { outputWebviewPreload, PreloadContext } from './output-webview-internal';
import { WorkspaceTrustService } from '@theia/workspace/lib/browser';
import { FromWebviewMessage, OutputChangedMessage } from './webview-communication';
import { CellUri, NotebookCellOutputsSplice } from '@theia/notebook/lib/common';
import { Disposable } from '@theia/core';

const cellModel = Symbol('CellModel');

export function createCellOutputWebviewContainer(ctx: interfaces.Container, cell: NotebookCellModel): interfaces.Container {
    const child = ctx.createChild();
    child.bind(cellModel).toConstantValue(cell);
    child.bind(CellOutputWebviewImpl).toSelf().inSingletonScope();
    return child;
}

@injectable()
export class CellOutputWebviewImpl implements CellOutputWebview, Disposable {

    @inject(NotebookRendererMessagingService)
    protected readonly messagingService: NotebookRendererMessagingService;

    @inject(cellModel)
    protected readonly cell: NotebookCellModel;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(WorkspaceTrustService)
    protected readonly workspaceTrustService: WorkspaceTrustService;

    @inject(NotebookRendererRegistry)
    protected readonly notebookRendererRegistry: NotebookRendererRegistry;

    @inject(NotebookEditorWidgetService)
    protected readonly notebookEditorWidgetService: NotebookEditorWidgetService;

    readonly id: string = v4();

    protected readonly elementref = React.createRef<HTMLDivElement>();

    protected webviewWidget: WebviewWidget;

    @postConstruct()
    protected async init(): Promise<void> {
        this.cell.onDidChangeOutputs(outputChange => this.updateOutput(outputChange));

        this.webviewWidget = await this.widgetManager.getOrCreateWidget(WebviewWidget.FACTORY_ID, {id: this.id});
        this.webviewWidget.setContentOptions({allowScripts: true});
        this.webviewWidget.setHTML(await this.createWebviewContent());

        this.webviewWidget.onMessage((message: FromWebviewMessage) => {
            this.handleWebviewMessage(message);
        });
    }

    render(): JSX.Element {
        return <div style={{padding: '5px 0px', margin: '0px 10px'}} ref={this.elementref}></div>;
    }

    attachWebview(): void {
        if (this.elementref.current) {
            this.webviewWidget.processMessage(new Message('before-attach'));
            this.elementref.current.appendChild(this.webviewWidget.node);
            this.webviewWidget.processMessage(new Message('after-attach'));
            this.webviewWidget.setIframeHeight(0);
        }
    }

    isAttached(): boolean {
        return this.elementref.current?.contains(this.webviewWidget.node) ?? false;
    }

    updateOutput(update: NotebookCellOutputsSplice): void {
        if (this.cell.outputs.length > 0) {
            if (this.webviewWidget.isHidden) {
                this.webviewWidget.show();
            }

            const updateOuptutMessage: OutputChangedMessage = {
                type: 'outputChanged',
                newOutputs: update.newOutputs.map(output => ({
                    id: output.outputId,
                    items: output.outputs.map(item => ({ mime: item.mime, data: item.data.buffer })),
                    metadata: output.metadata
                })),
                deletedOutputIds: this.cell.outputs.slice(update.start, update.start + update.deleteCount).map(output => output.outputId)
            };

            this.webviewWidget.sendMessage(updateOuptutMessage);
        }
    }

    private handleWebviewMessage(message: FromWebviewMessage): void {
        switch (message.type) {
            case 'initialized':
                this.updateOutput({newOutputs: this.cell.outputs, start: 0, deleteCount: 0});
                break;
            case 'customRendererMessage':
                this.messagingService.getScoped('').postMessage(message.rendererId, message.message);
                break;
            case 'didRenderOutput':
                this.webviewWidget.setIframeHeight(message.contentHeight + 5);
                break;
            case 'did-scroll-wheel':
                this.notebookEditorWidgetService.getNotebookEditor(`notebook:${CellUri.parse(this.cell.uri)?.notebook}`)?.node.scrollBy(message.deltaX, message.deltaY);
                break;
        }
    }

    private async createWebviewContent(): Promise<string> {
        const isWorkspaceTrusted = await this.workspaceTrustService.getWorkspaceTrust();
        const preloads = this.preloadsScriptString(isWorkspaceTrusted);
        const content = `
            <html>
                <head>
                    <meta charset="UTF-8">
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
            renderOptions: { // TODO these should be changeable in the settings
                lineLimit: 30,
                outputScrolling: false,
                outputWordWrap: false,
            }
        };
        // TS will try compiling `import()` in webviewPreloads, so use a helper function instead
        // of using `import(...)` directly
        return `
            const __import = (x) => import(x);
            (${outputWebviewPreload})(JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(ctx))}")))`;
    }

    dispose(): void {
        this.webviewWidget.dispose();
    }
}
