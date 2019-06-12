/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import { injectable, inject } from 'inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import * as React from 'react';
import '../../src/browser/find-text.css';
import { Terminal } from 'xterm';
import * as ReactDOM from 'react-dom';
import { findNext, findPrevious } from 'xterm/lib/addons/search/search';
import { ISearchOptions } from 'xterm/lib/addons/search/Interfaces';

export const FIND_TERMINAL_TEXT_WIDGET_FACTORY_ID = 'find-terminal-text-widget';
export const FindTerminalTextWidgetFactory = Symbol('FindTerminalWidgetFactory');
export type FindTerminalTextWidgetFactory = (terminal: Terminal) => FindTextTerminalWidget;

export const FIND_TERMINAL_TEXT_WIDGET_ID = 'find-terminal-text-widget';

export enum TerminalSearchOption {
    CaseSensitiv = 'caseSensitive',
    WholeWord = 'wholeWord',
    RegExp = 'regex'
}

@injectable()
export class FindTextTerminalWidget extends ReactWidget {

    private searchInput: HTMLInputElement | null;
    private searchBox: HTMLDivElement | null;
    private searcOptions: ISearchOptions = {};

    @inject(Terminal)
    protected terminal: Terminal;

    focus(): void {
        if (this.searchInput) {
            this.searchInput.focus();
        }
    }

    update(): void {
        ReactDOM.render(<React.Fragment>{this.render()}</React.Fragment>, this.node);
    }

    render(): React.ReactNode {
        this.node.classList.add('find-terminal-widget-parent');
        return <div className='find-terminal-widget'>
            <div className='search-elem-box' ref={searchBox => this.searchBox = searchBox} >
                <input
                    title='Find'
                    type='text'
                    placeholder='Find'
                    ref={ip => this.searchInput = ip}
                    onKeyUp = {() => this.search()}
                    onFocus = {() => this.onSearchInputFocus()}
                    onBlur = {() => this.onSearchInputBlur()}
                />
                {this.renderSearchOptions()}
            </div>
            <button title='Previous match' className='search-elem' onClick={() => this.findPrevious()}>&#171;</button>
            <button title='Next match' className='search-elem' onClick={() => this.findNext()}>&#187;</button>
            <button title='Close' className='search-elem close' onClick={() => this.hide()}></button>
       </div>;
    }

    onSearchInputFocus() {
        if (this.searchBox) {
            this.searchBox.classList.add('option-enabled');
        }
    }

    onSearchInputBlur() {
        if (this.searchBox) {
            this.searchBox.classList.remove('option-enabled');
        }
    }

    protected renderSearchOptions(): React.ReactNode[] {
        const nodes: React.ReactNode[] = [];
        nodes.push(this.renderSearchOption('search-elem match-case', TerminalSearchOption.CaseSensitiv, 'Match case'));
        nodes.push(this.renderSearchOption('search-elem whole-word', TerminalSearchOption.WholeWord, 'Match whole word'));
        nodes.push(this.renderSearchOption('search-elem use-regexp', TerminalSearchOption.RegExp, 'Use regular expression'));
        return nodes;
    }

    protected renderSearchOption(style: string, optionName: string, title: string): React.ReactNode {
        return <span title={title} className={style} onClick={event => this.onOptionClicked(event, optionName)}></span>;
    }

    private onOptionClicked(event: React.MouseEvent<HTMLSpanElement>, optionName: string) {
        let enabled: boolean;
        switch (optionName) {
            case TerminalSearchOption.CaseSensitiv: {
                this.searcOptions.caseSensitive = enabled = !this.searcOptions.caseSensitive;
                break;
            }
            case TerminalSearchOption.WholeWord: {
                this.searcOptions.wholeWord = enabled = !this.searcOptions.wholeWord;
                break;
            }
            case TerminalSearchOption.RegExp: {
                this.searcOptions.regex = enabled = !this.searcOptions.regex;
                break;
            }
            default: throw new Error('Unknown search option!');
        }

        if (enabled) {
            event.currentTarget.classList.add('option-enabled');
        } else {
            event.currentTarget.classList.remove('option-enabled');
        }
        this.searchInput!.focus();
        this.search();
    }

    search() {
        this.findNext(true);
    }

    protected findNext(incremental?: boolean): void {
        if (this.searchInput) {
            const text = this.searchInput.value;
            findNext(this.terminal, text, {...this.searcOptions, incremental});
        }
    }

    protected findPrevious(): void {
        if (this.searchInput) {
            const text = this.searchInput.value;
            findPrevious(this.terminal, text, {...this.searcOptions, incremental: false});
        }
    }

    hide(): void {
        super.hide();
        this.terminal.focus();
    }
}
