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

import * as React from '@theia/core/shared/react';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering/markdown-string';
import { NotebookModel } from '../view-model/notebook-model';
import { CellRenderer, observeCellHeight } from './notebook-cell-list-view';
import { NotebookCellModel } from '../view-model/notebook-cell-model';
import { CellEditor } from './notebook-cell-editor';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MonacoEditorServices } from '@theia/monaco/lib/browser/monaco-editor';
import { CommandRegistry, nls } from '@theia/core';
import { NotebookContextManager } from '../service/notebook-context-manager';
import { NotebookOptionsService } from '../service/notebook-options';
import { NotebookCodeCellStatus } from './notebook-code-cell-view';
import { NotebookEditorFindMatch, NotebookEditorFindMatchOptions } from './notebook-find-widget';
import * as mark from 'advanced-mark.js';
import { NotebookCellEditorService } from '../service/notebook-cell-editor-service';
import { NotebookCellStatusBarService } from '../service/notebook-cell-status-bar-service';
import { LabelParser } from '@theia/core/lib/browser/label-parser';

@injectable()
export class NotebookMarkdownCellRenderer implements CellRenderer {

    @inject(MarkdownRenderer)
    private readonly markdownRenderer: MarkdownRenderer;
    @inject(MonacoEditorServices)
    protected readonly monacoServices: MonacoEditorServices;

    @inject(NotebookContextManager)
    protected readonly notebookContextManager: NotebookContextManager;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(NotebookOptionsService)
    protected readonly notebookOptionsService: NotebookOptionsService;

    @inject(NotebookCellEditorService)
    protected readonly notebookCellEditorService: NotebookCellEditorService;

    @inject(NotebookCellStatusBarService)
    protected readonly notebookCellStatusBarService: NotebookCellStatusBarService;

    @inject(LabelParser)
    protected readonly labelParser: LabelParser;

    render(notebookModel: NotebookModel, cell: NotebookCellModel): React.ReactNode {
        return <MarkdownCell
            markdownRenderer={this.markdownRenderer}
            commandRegistry={this.commandRegistry}
            monacoServices={this.monacoServices}
            notebookOptionsService={this.notebookOptionsService}
            cell={cell}
            notebookModel={notebookModel}
            notebookContextManager={this.notebookContextManager}
            notebookCellEditorService={this.notebookCellEditorService}
            notebookCellStatusBarService={this.notebookCellStatusBarService}
            labelParser={this.labelParser}
        />;
    }

    renderSidebar(notebookModel: NotebookModel, cell: NotebookCellModel): React.ReactNode {
        return <div className='theia-notebook-markdown-sidebar'></div>;
    }

    renderDragImage(cell: NotebookCellModel): HTMLElement {
        const dragImage = document.createElement('div');
        dragImage.style.width = this.notebookContextManager.context?.clientWidth + 'px';
        const markdownString = new MarkdownStringImpl(cell.source, { supportHtml: true, isTrusted: true });
        const markdownElement = this.markdownRenderer.render(markdownString).element;
        dragImage.appendChild(markdownElement);
        return dragImage;
    }
}

interface MarkdownCellProps {
    markdownRenderer: MarkdownRenderer;
    monacoServices: MonacoEditorServices;

    commandRegistry: CommandRegistry;
    cell: NotebookCellModel;
    notebookModel: NotebookModel;
    notebookContextManager: NotebookContextManager;
    notebookOptionsService: NotebookOptionsService;
    notebookCellEditorService: NotebookCellEditorService;
    notebookCellStatusBarService: NotebookCellStatusBarService;
    labelParser: LabelParser;
}

function MarkdownCell({
    markdownRenderer, monacoServices, cell, notebookModel, notebookContextManager,
    notebookOptionsService, commandRegistry, notebookCellEditorService, notebookCellStatusBarService,
    labelParser
}: MarkdownCellProps): React.JSX.Element {
    const [editMode, setEditMode] = React.useState(cell.editing);
    let empty = false;

    React.useEffect(() => {
        const listener = cell.onDidRequestCellEditChange(cellEdit => setEditMode(cellEdit));
        return () => listener.dispose();
    }, [editMode]);

    React.useEffect(() => {
        if (!editMode) {
            const instance = new mark(markdownContent);
            cell.onMarkdownFind = options => {
                instance.unmark();
                if (empty) {
                    return [];
                }
                return searchInMarkdown(instance, options);
            };
            return () => {
                cell.onMarkdownFind = undefined;
                instance.unmark();
            };
        }
    }, [editMode, cell.source]);

    let markdownContent: HTMLElement[] = React.useMemo(() => {
        const markdownString = new MarkdownStringImpl(cell.source, { supportHtml: true, isTrusted: true });
        const rendered = markdownRenderer.render(markdownString).element;
        const children: HTMLElement[] = [];
        rendered.childNodes.forEach(child => {
            if (child instanceof HTMLElement) {
                children.push(child);
            }
        });
        return children;
    }, [cell.source]);

    if (markdownContent.length === 0) {
        const italic = document.createElement('i');
        italic.className = 'theia-notebook-empty-markdown';
        italic.innerText = nls.localizeByDefault('Empty markdown cell, double-click or press enter to edit.');
        italic.style.pointerEvents = 'none';
        markdownContent = [italic];
        empty = true;
    }

    return editMode ?
        (<div className='theia-notebook-markdown-editor-container' key="code" ref={ref => observeCellHeight(ref, cell)}>
            <CellEditor notebookModel={notebookModel} cell={cell}
                monacoServices={monacoServices}
                notebookContextManager={notebookContextManager}
                notebookCellEditorService={notebookCellEditorService}
                fontInfo={notebookOptionsService.editorFontInfo} />
            <NotebookCodeCellStatus cell={cell} notebook={notebookModel}
                commandRegistry={commandRegistry}
                cellStatusBarService={notebookCellStatusBarService}
                labelParser={labelParser}
                onClick={() => cell.requestFocusEditor()} />
        </div >) :
        (<div className='theia-notebook-markdown-content' key="markdown"
            onDoubleClick={() => cell.requestEdit()}
            ref={node => {
                node?.replaceChildren(...markdownContent);
                observeCellHeight(node, cell);
            }}
        />);
}

function searchInMarkdown(instance: mark, options: NotebookEditorFindMatchOptions): NotebookEditorFindMatch[] {
    const matches: NotebookEditorFindMatch[] = [];
    const markOptions: mark.MarkOptions & mark.RegExpOptions = {
        className: 'theia-find-match',
        diacritics: false,
        caseSensitive: options.matchCase,
        acrossElements: true,
        separateWordSearch: false,
        each: node => {
            matches.push(new MarkdownEditorFindMatch(node));
        }
    };
    if (options.regex || options.wholeWord) {
        let search = options.search;
        if (options.wholeWord) {
            if (!options.regex) {
                search = escapeRegExp(search);
            }
            search = '\\b' + search + '\\b';
        }
        instance.markRegExp(new RegExp(search, options.matchCase ? '' : 'i'), markOptions);
    } else {
        instance.mark(options.search, markOptions);
    }
    return matches;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class MarkdownEditorFindMatch implements NotebookEditorFindMatch {

    constructor(readonly node: Node) { }

    private _selected = false;

    get selected(): boolean {
        return this._selected;
    }

    set selected(selected: boolean) {
        this._selected = selected;
        const className = 'theia-find-match-selected';
        if (this.node instanceof HTMLElement) {
            if (selected) {
                this.node.classList.add(className);
            } else {
                this.node.classList.remove(className);
            }
        }
    }

    show(): void {
        if (this.node instanceof HTMLElement) {
            this.node.scrollIntoView({
                behavior: 'instant',
                block: 'center'
            });
        }
    }
}
