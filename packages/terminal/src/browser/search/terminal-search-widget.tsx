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

import { injectable, inject, postConstruct } from 'inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import * as React from 'react';
import '../../../src/browser/style/terminal-search.css';
import { Terminal } from 'xterm';
import { SearchAddon, ISearchOptions } from 'xterm-addon-search';
import { Key } from '@theia/core/lib/browser';

export const TERMINAL_SEARCH_WIDGET_FACTORY_ID = 'terminal-search';
export const TerminalSearchWidgetFactory = Symbol('TerminalSearchWidgetFactory');
export type TerminalSearchWidgetFactory = (terminal: Terminal) => TerminalSearchWidget;

@injectable()
export class TerminalSearchWidget extends ReactWidget {

    private searchInput: HTMLInputElement | null;
    private searchBox: HTMLDivElement | null;
    private searchOptions: ISearchOptions = {};
    private searchAddon: SearchAddon;

    @inject(Terminal)
    protected terminal: Terminal;

    @postConstruct()
    protected init(): void {
        this.node.classList.add('theia-search-terminal-widget-parent');

        this.searchAddon = new SearchAddon();
        this.terminal.loadAddon(this.searchAddon);

        this.hide();
        this.update();
    }

    protected render(): React.ReactNode {
        return <div className='theia-search-terminal-widget'>
            <div className='theia-search-elem-box' ref={searchBox => this.searchBox = searchBox} >
                <input
                    title='Find'
                    type='text'
                    placeholder='Find'
                    ref={ip => this.searchInput = ip}
                    onKeyUp={this.onInputChanged}
                    onFocus={this.onSearchInputFocus}
                    onBlur={this.onSearchInputBlur}
                />
                <div title='Match case' tabIndex={0} className='search-elem match-case' onClick={this.handleCaseSensitiveOptionClicked}></div>
                <div title='Match whole word' tabIndex={0} className='search-elem whole-word' onClick={this.handleWholeWordOptionClicked}></div>
                <div title='Use regular expression' tabIndex={0} className='search-elem use-regexp' onClick={this.handleRegexOptionClicked}></div>
            </div>
            <button title='Previous match' className='search-elem arrow-up' onClick={this.handlePreviousButtonClicked}></button>
            <button title='Next match' className='search-elem arrow-down' onClick={this.handleNextButtonClicked}></button>
            <button title='Close' className='search-elem close' onClick={this.handleHide}></button>
       </div>;
    }

    onSearchInputFocus = (): void => {
        if (this.searchBox) {
            this.searchBox.classList.add('focused');
        }
    };

    onSearchInputBlur = (): void => {
        if (this.searchBox) {
            this.searchBox.classList.remove('focused');
        }
    };

    private handleHide = (): void => {
        this.hide();
    };

    private handleCaseSensitiveOptionClicked = (event: React.MouseEvent<HTMLSpanElement>): void => {
        this.searchOptions.caseSensitive = !this.searchOptions.caseSensitive;
        this.updateSearchInputBox(this.searchOptions.caseSensitive, event.currentTarget);
    };

    private handleWholeWordOptionClicked = (event: React.MouseEvent<HTMLSpanElement>): void => {
        this.searchOptions.wholeWord = !this.searchOptions.wholeWord;
        this.updateSearchInputBox(this.searchOptions.wholeWord, event.currentTarget);
    };

    private handleRegexOptionClicked = (event: React.MouseEvent<HTMLSpanElement>): void => {
        this.searchOptions.regex = !this.searchOptions.regex;
        this.updateSearchInputBox(this.searchOptions.regex, event.currentTarget);
    };

    private updateSearchInputBox(enable: boolean, optionElement: HTMLSpanElement): void {
        if (enable) {
            optionElement.classList.add('option-enabled');
        } else {
            optionElement.classList.remove('option-enabled');
        }
        this.searchInput!.focus();
    }

    private onInputChanged = (event: React.KeyboardEvent): void => {
        // move to previous search result on `Shift + Enter`
        if (event && event.shiftKey && event.keyCode === Key.ENTER.keyCode) {
            this.search(false, 'previous');
            return;
        }
        // move to next search result on `Enter`
        if (event && event.keyCode === Key.ENTER.keyCode) {
            this.search(false, 'next');
            return;
        }

        this.search(true, 'next');
    };

    search(incremental: boolean, searchDirection: 'next' | 'previous'): void {
        if (this.searchInput) {
            this.searchOptions.incremental = incremental;
            const searchText = this.searchInput.value;

            if (searchDirection === 'next') {
                this.searchAddon.findNext(searchText, this.searchOptions);
            }

            if (searchDirection === 'previous') {
                this.searchAddon.findPrevious(searchText, this.searchOptions);
            }
        }
    }

    private handleNextButtonClicked = (): void => {
        this.search(false, 'next');
    };

    private handlePreviousButtonClicked = (): void => {
        this.search(false, 'previous');
    };

    onAfterHide(): void {
        this.terminal.focus();
    }

    onAfterShow(): void {
        if (this.searchInput) {
            this.searchInput.select();
        }
    }
}
