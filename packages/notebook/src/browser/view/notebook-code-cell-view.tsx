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

import { inject, injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { MonacoEditorServices } from '@theia/monaco/lib/browser/monaco-editor';
import { CellOutputWebviewFactory, CellOutputWebview } from '../renderers/cell-output-webview';
import { NotebookRendererRegistry } from '../notebook-renderer-registry';
import { NotebookCellModel } from '../view-model/notebook-cell-model';
import { NotebookModel } from '../view-model/notebook-model';
import { CellEditor } from './notebook-cell-editor';
import { CellRenderer } from './notebook-cell-list-view';
import { NotebookCellToolbarFactory } from './notebook-cell-toolbar-factory';
import { NotebookCellActionContribution, NotebookCellCommands } from '../contributions/notebook-cell-actions-contribution';
import { CellExecution, NotebookExecutionStateService } from '../service/notebook-execution-state-service';
import { codicon } from '@theia/core/lib/browser';
import { NotebookCellExecutionState } from '../../common';
import { CommandRegistry, DisposableCollection, nls } from '@theia/core';
import { NotebookContextManager } from '../service/notebook-context-manager';
import { NotebookViewportService } from './notebook-viewport-service';
import { EditorPreferences } from '@theia/editor/lib/browser';
import { BareFontInfo } from '@theia/monaco-editor-core/esm/vs/editor/common/config/fontInfo';
import { PixelRatio } from '@theia/monaco-editor-core/esm/vs/base/browser/browser';

@injectable()
export class NotebookCodeCellRenderer implements CellRenderer {
    @inject(MonacoEditorServices)
    protected readonly monacoServices: MonacoEditorServices;

    @inject(NotebookRendererRegistry)
    protected readonly notebookRendererRegistry: NotebookRendererRegistry;

    @inject(CellOutputWebviewFactory)
    protected readonly cellOutputWebviewFactory: CellOutputWebviewFactory;

    @inject(NotebookCellToolbarFactory)
    protected readonly notebookCellToolbarFactory: NotebookCellToolbarFactory;

    @inject(NotebookExecutionStateService)
    protected readonly executionStateService: NotebookExecutionStateService;

    @inject(NotebookContextManager)
    protected readonly notebookContextManager: NotebookContextManager;

    @inject(NotebookViewportService)
    protected readonly notebookViewportService: NotebookViewportService;

    @inject(EditorPreferences)
    protected readonly editorPreferences: EditorPreferences;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    protected fontInfo: BareFontInfo | undefined;

    render(notebookModel: NotebookModel, cell: NotebookCellModel, handle: number): React.ReactNode {
        return <div>
            <div className='theia-notebook-cell-with-sidebar'>
                <div className='theia-notebook-cell-sidebar'>
                    {this.notebookCellToolbarFactory.renderSidebar(NotebookCellActionContribution.CODE_CELL_SIDEBAR_MENU, cell, {
                        contextMenuArgs: () => [cell], commandArgs: () => [notebookModel, cell]
                    })
                    }
                    <CodeCellExecutionOrder cell={cell} />
                </div>
                <div className='theia-notebook-cell-editor-container'>
                    <CellEditor notebookModel={notebookModel} cell={cell}
                        monacoServices={this.monacoServices}
                        notebookContextManager={this.notebookContextManager}
                        notebookViewportService={this.notebookViewportService}
                        fontInfo={this.getOrCreateMonacoFontInfo()} />
                    <NotebookCodeCellStatus cell={cell} notebook={notebookModel}
                        commandRegistry={this.commandRegistry}
                        executionStateService={this.executionStateService}
                        onClick={() => cell.requestFocusEditor()} />
                </div >
            </div >
            <div className='theia-notebook-cell-with-sidebar'>
                <NotebookCodeCellOutputs cell={cell} notebook={notebookModel} outputWebviewFactory={this.cellOutputWebviewFactory}
                    renderSidebar={() =>
                        this.notebookCellToolbarFactory.renderSidebar(NotebookCellActionContribution.OUTPUT_SIDEBAR_MENU, cell, {
                            contextMenuArgs: () => [notebookModel, cell, cell.outputs[0]]
                        })
                    } />
            </div>
        </div >;
    }

    renderDragImage(cell: NotebookCellModel): HTMLElement {
        const dragImage = document.createElement('div');
        dragImage.className = 'theia-notebook-drag-image';
        dragImage.textContent = nls.localize('theia/notebook/dragGhostImage/codeText', 'Code cell selected');
        return dragImage;
    }

    protected getOrCreateMonacoFontInfo(): BareFontInfo {
        if (!this.fontInfo) {
            this.fontInfo = this.createFontInfo();
            this.editorPreferences.onPreferenceChanged(e => this.fontInfo = this.createFontInfo());
        }
        return this.fontInfo;
    }

    protected createFontInfo(): BareFontInfo {
        return BareFontInfo.createFromRawSettings({
            fontFamily: this.editorPreferences['editor.fontFamily'],
            fontWeight: String(this.editorPreferences['editor.fontWeight']),
            fontSize: this.editorPreferences['editor.fontSize'],
            fontLigatures: this.editorPreferences['editor.fontLigatures'],
            lineHeight: this.editorPreferences['editor.lineHeight'],
            letterSpacing: this.editorPreferences['editor.letterSpacing'],
        }, PixelRatio.value);
    }
}

export interface NotebookCodeCellStatusProps {
    notebook: NotebookModel;
    cell: NotebookCellModel;
    commandRegistry: CommandRegistry;
    executionStateService: NotebookExecutionStateService;
    onClick: () => void;
}

export interface NotebookCodeCellStatusState {
    currentExecution?: CellExecution;
    executionTime: number;
}

export class NotebookCodeCellStatus extends React.Component<NotebookCodeCellStatusProps, NotebookCodeCellStatusState> {

    protected toDispose = new DisposableCollection();

    constructor(props: NotebookCodeCellStatusProps) {
        super(props);

        this.state = {
            executionTime: 0
        };

        let currentInterval: NodeJS.Timeout | undefined;
        this.toDispose.push(props.executionStateService.onDidChangeExecution(event => {
            if (event.affectsCell(this.props.cell.uri)) {
                this.setState({ currentExecution: event.changed, executionTime: 0 });
                clearInterval(currentInterval);
                if (event.changed?.state === NotebookCellExecutionState.Executing) {
                    const startTime = Date.now();
                    // The resolution of the time display is only a single digit after the decimal point.
                    // Therefore, we only need to update the display every 100ms.
                    currentInterval = setInterval(() => {
                        this.setState({
                            executionTime: Date.now() - startTime
                        });
                    }, 100);
                }
            }
        }));

        this.toDispose.push(props.cell.onDidChangeLanguage(() => {
            this.forceUpdate();
        }));
    }

    override componentWillUnmount(): void {
        this.toDispose.dispose();
    }

    override render(): React.ReactNode {
        return <div className='notebook-cell-status' onClick={() => this.props.onClick()}>
            <div className='notebook-cell-status-left'>
                {this.renderExecutionState()}
            </div>
            <div className='notebook-cell-status-right'>
                <span className='notebook-cell-language-label' onClick={() => {
                    this.props.commandRegistry.executeCommand(NotebookCellCommands.CHANGE_CELL_LANGUAGE.id, this.props.notebook, this.props.cell);
                }}>{this.props.cell.languageName}</span>
            </div>
        </div>;
    }

    private renderExecutionState(): React.ReactNode {
        const state = this.state.currentExecution?.state;
        const { lastRunSuccess } = this.props.cell.internalMetadata;

        let iconClasses: string | undefined = undefined;
        let color: string | undefined = undefined;
        if (!state && lastRunSuccess) {
            iconClasses = codicon('check');
            color = 'green';
        } else if (!state && lastRunSuccess === false) {
            iconClasses = codicon('error');
            color = 'red';
        } else if (state === NotebookCellExecutionState.Pending || state === NotebookCellExecutionState.Unconfirmed) {
            iconClasses = codicon('clock');
        } else if (state === NotebookCellExecutionState.Executing) {
            iconClasses = `${codicon('sync')} theia-animation-spin`;
        }
        return <>
            {iconClasses &&
                <>
                    <span className={`${iconClasses} notebook-cell-status-item`} style={{ color }}></span>
                    <div className='notebook-cell-status-item'>{this.renderTime(this.getExecutionTime())}</div>
                </>}
        </>;
    }

    private getExecutionTime(): number {
        const { runStartTime, runEndTime } = this.props.cell.internalMetadata;
        const { executionTime } = this.state;
        if (runStartTime !== undefined && runEndTime !== undefined) {
            return runEndTime - runStartTime;
        }
        return executionTime;
    }

    private renderTime(ms: number): string {
        return `${(ms / 1000).toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}s`;
    }
}

interface NotebookCellOutputProps {
    cell: NotebookCellModel;
    notebook: NotebookModel;
    outputWebviewFactory: CellOutputWebviewFactory;
    renderSidebar: () => React.ReactNode;
}

export class NotebookCodeCellOutputs extends React.Component<NotebookCellOutputProps> {

    protected outputsWebview: CellOutputWebview | undefined;
    protected outputsWebviewPromise: Promise<CellOutputWebview> | undefined;

    protected toDispose = new DisposableCollection();

    constructor(props: NotebookCellOutputProps) {
        super(props);
    }

    override async componentDidMount(): Promise<void> {
        const { cell, notebook, outputWebviewFactory } = this.props;
        this.toDispose.push(cell.onDidChangeOutputs(() => this.updateOutputs()));
        this.toDispose.push(cell.onDidChangeOutputVisibility(visible => {
            if (!visible && this.outputsWebview) {
                this.outputsWebview?.dispose();
                this.outputsWebview = undefined;
                this.outputsWebviewPromise = undefined;
                this.forceUpdate();
            } else {
                this.updateOutputs();
            }
        }));
        if (cell.outputs.length > 0) {
            this.outputsWebviewPromise = outputWebviewFactory(cell, notebook).then(webview => {
                this.outputsWebview = webview;
                this.forceUpdate();
                return webview;
            });
        }
    }

    protected async updateOutputs(): Promise<void> {
        const { cell, notebook, outputWebviewFactory } = this.props;
        if (!this.outputsWebviewPromise && cell.outputs.length > 0) {
            this.outputsWebviewPromise = outputWebviewFactory(cell, notebook).then(webview => {
                this.outputsWebview = webview;
                this.forceUpdate();
                return webview;
            });
            this.forceUpdate();
        } else if (this.outputsWebviewPromise && cell.outputs.length === 0 && cell.internalMetadata.runEndTime) {
            (await this.outputsWebviewPromise).dispose();
            this.outputsWebview = undefined;
            this.outputsWebviewPromise = undefined;
            this.forceUpdate();
        }
    }

    override async componentDidUpdate(): Promise<void> {
        if (!(await this.outputsWebviewPromise)?.isAttached()) {
            (await this.outputsWebviewPromise)?.attachWebview();
        }
    }

    override async componentWillUnmount(): Promise<void> {
        this.toDispose.dispose();
        (await this.outputsWebviewPromise)?.dispose();
    }

    override render(): React.ReactNode {
        return this.outputsWebview && this.props.cell.outputVisible ?
            <>
                {this.props.renderSidebar()}
                {this.outputsWebview.render()}
            </> :
            this.props.cell.outputs?.length ? <i className='theia-notebook-collapsed-output'>{nls.localizeByDefault('Outputs are collapsed')}</i> : <></>;

    }

}

interface NotebookCellExecutionOrderProps {
    cell: NotebookCellModel;
}

function CodeCellExecutionOrder({ cell }: NotebookCellExecutionOrderProps): React.JSX.Element {
    const [executionOrder, setExecutionOrder] = React.useState(cell.internalMetadata.executionOrder ?? ' ');

    React.useEffect(() => {
        const listener = cell.onDidChangeInternalMetadata(e => {
            setExecutionOrder(cell.internalMetadata.executionOrder ?? ' ');
        });
        return () => listener.dispose();
    }, []);

    return <span className='theia-notebook-code-cell-execution-order'>{`[${executionOrder}]`}</span>;
}
