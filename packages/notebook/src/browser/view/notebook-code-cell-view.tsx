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
import { NotebookRendererRegistry } from '../notebook-renderer-registry';
import { NotebookCellModel } from '../view-model/notebook-cell-model';
import { NotebookModel } from '../view-model/notebook-model';
import { CellEditor } from './notebook-cell-editor';
import { CellRenderer, observeCellHeight } from './notebook-cell-list-view';
import { NotebookCellToolbarFactory } from './notebook-cell-toolbar-factory';
import { NotebookCellActionContribution, NotebookCellCommands } from '../contributions/notebook-cell-actions-contribution';
import { CellExecution, NotebookExecutionStateService } from '../service/notebook-execution-state-service';
import { codicon } from '@theia/core/lib/browser';
import { NotebookCellExecutionState } from '../../common';
import { CancellationToken, CommandRegistry, DisposableCollection, nls } from '@theia/core';
import { NotebookContextManager } from '../service/notebook-context-manager';
import { NotebookViewportService } from './notebook-viewport-service';
import { EditorPreferences } from '@theia/editor/lib/browser';
import { NotebookOptionsService } from '../service/notebook-options';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { MarkdownString } from '@theia/monaco-editor-core/esm/vs/base/common/htmlContent';
import { NotebookCellEditorService } from '../service/notebook-cell-editor-service';
import { CellOutputWebview } from '../renderers/cell-output-webview';
import { NotebookCellStatusBarItem, NotebookCellStatusBarItemList, NotebookCellStatusBarService } from '../service/notebook-cell-status-bar-service';
import { LabelParser } from '@theia/core/lib/browser/label-parser';

@injectable()
export class NotebookCodeCellRenderer implements CellRenderer {
    @inject(MonacoEditorServices)
    protected readonly monacoServices: MonacoEditorServices;

    @inject(NotebookRendererRegistry)
    protected readonly notebookRendererRegistry: NotebookRendererRegistry;

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

    @inject(NotebookCellEditorService)
    protected readonly notebookCellEditorService: NotebookCellEditorService;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(NotebookOptionsService)
    protected readonly notebookOptionsService: NotebookOptionsService;

    @inject(MarkdownRenderer)
    protected readonly markdownRenderer: MarkdownRenderer;

    @inject(CellOutputWebview)
    protected readonly outputWebview: CellOutputWebview;

    @inject(NotebookCellStatusBarService)
    protected readonly notebookCellStatusBarService: NotebookCellStatusBarService;

    @inject(LabelParser)
    protected readonly labelParser: LabelParser;

    render(notebookModel: NotebookModel, cell: NotebookCellModel, handle: number): React.ReactNode {
        return <div className='theia-notebook-cell-with-sidebar' ref={ref => observeCellHeight(ref, cell)}>
            <div className='theia-notebook-cell-editor-container'>
                <CellEditor notebookModel={notebookModel} cell={cell}
                    monacoServices={this.monacoServices}
                    notebookContextManager={this.notebookContextManager}
                    notebookViewportService={this.notebookViewportService}
                    notebookCellEditorService={this.notebookCellEditorService}
                    fontInfo={this.notebookOptionsService.editorFontInfo} />
                <NotebookCodeCellStatus cell={cell} notebook={notebookModel}
                    commandRegistry={this.commandRegistry}
                    executionStateService={this.executionStateService}
                    cellStatusBarService={this.notebookCellStatusBarService}
                    labelParser={this.labelParser}
                    onClick={() => cell.requestFocusEditor()} />
            </div >
        </div >;
    }

    renderSidebar(notebookModel: NotebookModel, cell: NotebookCellModel): React.ReactNode {
        return <div>
            <NotebookCodeCellSidebar cell={cell} notebook={notebookModel} notebookCellToolbarFactory={this.notebookCellToolbarFactory} />
            <NotebookCodeCellOutputs cell={cell} notebook={notebookModel} outputWebview={this.outputWebview}
                renderSidebar={() =>
                    this.notebookCellToolbarFactory.renderSidebar(NotebookCellActionContribution.OUTPUT_SIDEBAR_MENU, cell, {
                        contextMenuArgs: () => [notebookModel, cell, cell.outputs[0]]
                    })
                } />
        </div>;

    }

    renderDragImage(cell: NotebookCellModel): HTMLElement {
        const dragImage = document.createElement('div');
        dragImage.className = 'theia-notebook-drag-image';
        dragImage.style.width = this.notebookContextManager.context?.clientWidth + 'px';
        dragImage.style.height = '100px';
        dragImage.style.display = 'flex';

        const fakeRunButton = document.createElement('span');
        fakeRunButton.className = `${codicon('play')} theia-notebook-cell-status-item`;
        dragImage.appendChild(fakeRunButton);

        const fakeEditor = document.createElement('div');
        dragImage.appendChild(fakeEditor);
        const lines = cell.source.split('\n').slice(0, 5).join('\n');
        const codeSequence = this.getMarkdownCodeSequence(lines);
        const firstLine = new MarkdownString(`${codeSequence}${cell.language}\n${lines}\n${codeSequence}`, { supportHtml: true, isTrusted: false });
        fakeEditor.appendChild(this.markdownRenderer.render(firstLine).element);
        fakeEditor.classList.add('theia-notebook-cell-editor-container');
        fakeEditor.style.padding = '10px';
        return dragImage;
    }

    protected getMarkdownCodeSequence(input: string): string {
        // We need a minimum of 3 backticks to start a code block.
        let longest = 2;
        let current = 0;
        for (let i = 0; i < input.length; i++) {
            const char = input.charAt(i);
            if (char === '`') {
                current++;
                if (current > longest) {
                    longest = current;
                }
            } else {
                current = 0;
            }
        }
        return Array(longest + 1).fill('`').join('');
    }

}

export interface NotebookCodeCellSidebarProps {
    cell: NotebookCellModel;
    notebook: NotebookModel;
    notebookCellToolbarFactory: NotebookCellToolbarFactory
}

export class NotebookCodeCellSidebar extends React.Component<NotebookCodeCellSidebarProps> {

    protected toDispose = new DisposableCollection();

    constructor(props: NotebookCodeCellSidebarProps) {
        super(props);

        this.toDispose.push(props.cell.onDidCellHeightChange(() => this.forceUpdate()));
    }

    override componentWillUnmount(): void {
        this.toDispose.dispose();
    }

    override render(): React.ReactNode {
        return <div className='theia-notebook-cell-sidebar-actions' style={{ height: `${this.props.cell.cellHeight}px` }}>
            {this.props.notebookCellToolbarFactory.renderSidebar(NotebookCellActionContribution.CODE_CELL_SIDEBAR_MENU, this.props.cell, {
                contextMenuArgs: () => [this.props.cell], commandArgs: () => [this.props.notebook, this.props.cell]
            })
            }
            <CodeCellExecutionOrder cell={this.props.cell} />
        </div>;
    }
}

export interface NotebookCodeCellStatusProps {
    notebook: NotebookModel;
    cell: NotebookCellModel;
    commandRegistry: CommandRegistry;
    cellStatusBarService: NotebookCellStatusBarService;
    executionStateService?: NotebookExecutionStateService;
    labelParser: LabelParser;
    onClick: () => void;
}

export interface NotebookCodeCellStatusState {
    currentExecution?: CellExecution;
    executionTime: number;
}

export class NotebookCodeCellStatus extends React.Component<NotebookCodeCellStatusProps, NotebookCodeCellStatusState> {

    protected toDispose = new DisposableCollection();

    protected statusBarItems: NotebookCellStatusBarItemList[] = [];

    constructor(props: NotebookCodeCellStatusProps) {
        super(props);

        this.state = {
            executionTime: 0
        };

        let currentInterval: NodeJS.Timeout | undefined;
        if (props.executionStateService) {
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
        }

        this.toDispose.push(props.cell.onDidChangeLanguage(() => {
            this.forceUpdate();
        }));

        this.updateStatusBarItems();
        this.props.cellStatusBarService.onDidChangeItems(() => this.updateStatusBarItems());
        this.props.notebook.onContentChanged(() => this.updateStatusBarItems());
    }

    async updateStatusBarItems(): Promise<void> {
        this.statusBarItems = await this.props.cellStatusBarService.getStatusBarItemsForCell(
            this.props.notebook.uri,
            this.props.notebook.cells.indexOf(this.props.cell),
            this.props.notebook.viewType,
            CancellationToken.None);
        this.forceUpdate();
    }

    override componentWillUnmount(): void {
        this.toDispose.dispose();
    }

    override render(): React.ReactNode {
        return <div className='notebook-cell-status' onClick={() => this.props.onClick()}>
            <div className='notebook-cell-status-left'>
                {this.props.executionStateService && this.renderExecutionState()}
                {this.statusBarItems?.length && this.renderStatusBarItems()}
            </div>
            <div className='notebook-cell-status-right'>
                <span className='notebook-cell-language-label' onClick={() => {
                    this.props.commandRegistry.executeCommand(NotebookCellCommands.CHANGE_CELL_LANGUAGE.id, this.props.notebook, this.props.cell);
                }}>{this.props.cell.languageName}</span>
            </div>
        </div>;
    }

    protected renderExecutionState(): React.ReactNode {
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

    protected getExecutionTime(): number {
        const { runStartTime, runEndTime } = this.props.cell.internalMetadata;
        const { executionTime } = this.state;
        if (runStartTime !== undefined && runEndTime !== undefined) {
            return runEndTime - runStartTime;
        }
        return executionTime;
    }

    protected renderTime(ms: number): string {
        return `${(ms / 1000).toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}s`;
    }

    protected renderStatusBarItems(): React.ReactNode {
        return <>
            {
                this.statusBarItems.flatMap((itemList, listIndex) =>
                    itemList.items.map((item, index) => this.renderStatusBarItem(item, `${listIndex}-${index}`)
                    )
                )
            }
        </>;
    }

    protected renderStatusBarItem(item: NotebookCellStatusBarItem, key: string): React.ReactNode {
        const content = this.props.labelParser.parse(item.text).map(part => {
            if (typeof part === 'string') {
                return part;
            } else {
                return <span key={part.name} className={`codicon codicon-${part.name}`}></span>;
            }
        });
        return <div key={key} className={`cell-status-bar-item ${item.command ? 'cell-status-item-has-command' : ''}`} onClick={async () => {
            if (item.command) {
                if (typeof item.command === 'string') {
                    this.props.commandRegistry.executeCommand(item.command);
                } else {
                    this.props.commandRegistry.executeCommand(item.command.id, ...(item.command.arguments ?? []));
                }
            }
        }}>
            {content}
        </div>;
    }

}

interface NotebookCellOutputProps {
    cell: NotebookCellModel;
    notebook: NotebookModel;
    outputWebview: CellOutputWebview;
    renderSidebar: () => React.ReactNode;
}

export class NotebookCodeCellOutputs extends React.Component<NotebookCellOutputProps> {

    protected toDispose = new DisposableCollection();

    protected outputHeight: number = 0;

    override async componentDidMount(): Promise<void> {
        const { cell } = this.props;
        this.toDispose.push(cell.onDidChangeOutputs(() => this.forceUpdate()));
        this.toDispose.push(this.props.cell.onDidChangeOutputVisibility(() => this.forceUpdate()));
        this.toDispose.push(this.props.outputWebview.onDidRenderOutput(event => {
            if (event.cellHandle === this.props.cell.handle) {
                this.outputHeight = event.outputHeight;
                this.forceUpdate();
            }
        }));
    }

    override componentWillUnmount(): void {
        this.toDispose.dispose();
    }

    override render(): React.ReactNode {
        if (!this.props.cell.outputs?.length) {
            return <></>;
        }
        if (this.props.cell.outputVisible) {
            return <div style={{ minHeight: this.outputHeight }}>
                {this.props.renderSidebar()}
            </div>;
        }
        return <div className='theia-notebook-collapsed-output-container'><i className='theia-notebook-collapsed-output'>{nls.localizeByDefault('Outputs are collapsed')}</i></div>;
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
