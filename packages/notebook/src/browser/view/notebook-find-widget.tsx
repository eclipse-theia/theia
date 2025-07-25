// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import { nls } from '@theia/core';
import * as React from '@theia/core/shared/react';
import { codicon } from '@theia/core/lib/browser';
import debounce = require('@theia/core/shared/lodash.debounce');

export interface NotebookEditorFindMatch {
    selected: boolean;
    show(): void;
    replace?(value: string): void;
}

export interface NotebookEditorFindMatchOptions {
    search: string;
    matchCase: boolean;
    wholeWord: boolean;
    regex: boolean;
    activeFilters: string[];
}

export interface NotebookEditorFindFilter {
    id: string;
    label: string;
    active: boolean;
}

export interface NotebookEditorFindOptions {
    search?: string;
    jumpToMatch?: boolean;
    matchCase?: boolean;
    wholeWord?: boolean;
    regex?: boolean;
    modifyIndex?: (matches: NotebookEditorFindMatch[], index: number) => number;
}

export interface NotebookFindWidgetProps {
    hidden?: boolean;
    filters?: NotebookEditorFindFilter[];
    onClose(): void;
    onSearch(options: NotebookEditorFindMatchOptions): NotebookEditorFindMatch[];
    onReplace(matches: NotebookEditorFindMatch[], value: string): void;
}

export interface NotebookFindWidgetState {
    search: string;
    replace: string;
    expanded: boolean;
    matchCase: boolean;
    wholeWord: boolean;
    regex: boolean;
    activeFilters: string[];
    currentMatch: number;
    matches: NotebookEditorFindMatch[];
}

export class NotebookFindWidget extends React.Component<NotebookFindWidgetProps, NotebookFindWidgetState> {

    private searchRef = React.createRef<HTMLInputElement>();
    private debounceSearch = debounce(this.search.bind(this), 50);

    constructor(props: NotebookFindWidgetProps) {
        super(props);
        this.state = {
            search: '',
            replace: '',
            currentMatch: 0,
            matches: [],
            expanded: false,
            matchCase: false,
            regex: false,
            wholeWord: false,
            activeFilters: props.filters?.filter(filter => filter.active).map(filter => filter.id) || []
        };
    }

    override render(): React.ReactNode {
        const hasMatches = this.hasMatches();
        const canReplace = this.canReplace();
        const canReplaceAll = this.canReplaceAll();
        return (
            <div onKeyUp={event => {
                if (event.key === 'Escape') {
                    this.props.onClose();
                }
            }} className={`theia-notebook-find-widget ${!this.state.expanded ? 'search-mode' : ''} ${this.props.hidden ? 'hidden' : ''}`}>
                <div className='theia-notebook-find-widget-expand' title={nls.localizeByDefault('Toggle Replace')} onClick={() => {
                    this.setState({
                        expanded: !this.state.expanded
                    });
                }}>
                    <div className={codicon(`chevron-${this.state.expanded ? 'down' : 'right'}`)}></div>
                </div>
                <div className='theia-notebook-find-widget-inputs'>
                    <div className='theia-notebook-find-widget-input-wrapper'>
                        <input
                            ref={this.searchRef}
                            type='text'
                            className='theia-input theia-notebook-find-widget-input'
                            placeholder={nls.localizeByDefault('Find')}
                            value={this.state.search}
                            onChange={event => {
                                this.setState({
                                    search: event.target.value
                                });
                                this.debounceSearch({});
                            }}
                            onKeyDown={event => {
                                if (event.key === 'Enter') {
                                    if (event.shiftKey) {
                                        this.gotoPreviousMatch();
                                    } else {
                                        this.gotoNextMatch();
                                    }
                                    event.preventDefault();
                                }
                            }}
                        />
                        <div
                            className={`${codicon('case-sensitive', true)} option ${this.state.matchCase ? 'enabled' : ''}`}
                            title={nls.localizeByDefault('Match Case')}
                            onClick={() => {
                                this.search({
                                    matchCase: !this.state.matchCase
                                });
                            }}></div>
                        <div
                            className={`${codicon('whole-word', true)} option ${this.state.wholeWord ? 'enabled' : ''}`}
                            title={nls.localizeByDefault('Match Whole Word')}
                            onClick={() => {
                                this.search({
                                    wholeWord: !this.state.wholeWord
                                });
                            }}></div>
                        <div
                            className={`${codicon('regex', true)} option ${this.state.regex ? 'enabled' : ''}`}
                            title={nls.localizeByDefault('Use Regular Expression')}
                            onClick={() => {
                                this.search({
                                    regex: !this.state.regex
                                });
                            }}></div>
                        {/* <div
                            className={`${codicon('filter', true)} option ${this.state.wholeWord ? 'enabled' : ''}`}
                            title={nls.localizeByDefault('Find Filters')}></div> */}
                    </div>
                    <input
                        type='text'
                        className='theia-input theia-notebook-find-widget-replace'
                        placeholder={nls.localizeByDefault('Replace')}
                        value={this.state.replace}
                        onChange={event => {
                            this.setState({
                                replace: event.target.value
                            });
                        }}
                        onKeyDown={event => {
                            if (event.key === 'Enter') {
                                this.replaceOne();
                                event.preventDefault();
                            }
                        }}
                    />
                </div>
                <div className='theia-notebook-find-widget-buttons'>
                    <div className='theia-notebook-find-widget-buttons-first'>
                        <div className='theia-notebook-find-widget-matches-count'>
                            {this.getMatchesCount()}
                        </div>
                        <div
                            className={`${codicon('arrow-up', hasMatches)} ${hasMatches ? '' : 'disabled'}`}
                            title={nls.localizeByDefault('Previous Match')}
                            onClick={() => {
                                this.gotoPreviousMatch();
                            }}
                        ></div>
                        <div
                            className={`${codicon('arrow-down', hasMatches)} ${hasMatches ? '' : 'disabled'}`}
                            title={nls.localizeByDefault('Next Match')}
                            onClick={() => {
                                this.gotoNextMatch();
                            }}
                        ></div>
                        <div
                            className={codicon('close', true)}
                            title={nls.localizeByDefault('Close')}
                            onClick={() => {
                                this.props.onClose();
                            }}
                        ></div>
                    </div>
                    <div className='theia-notebook-find-widget-buttons-second'>
                        <div
                            className={`${codicon('replace', canReplace)} ${canReplace ? '' : 'disabled'}`}
                            title={nls.localizeByDefault('Replace')}
                            onClick={() => {
                                this.replaceOne();
                            }}
                        ></div>
                        <div
                            className={`${codicon('replace-all', canReplaceAll)} ${canReplaceAll ? '' : 'disabled'}`}
                            title={nls.localizeByDefault('Replace All')}
                            onClick={() => {
                                this.replaceAll();
                            }}
                        ></div>
                    </div>
                </div>
            </div>
        );
    }

    private hasMatches(): boolean {
        return this.state.matches.length > 0;
    }

    private canReplace(): boolean {
        return Boolean(this.state.matches[this.state.currentMatch]?.replace);
    }

    private canReplaceAll(): boolean {
        return this.state.matches.some(match => Boolean(match.replace));
    }

    private getMatchesCount(): string {
        if (this.hasMatches()) {
            return nls.localizeByDefault('{0} of {1}', this.state.currentMatch + 1, this.state.matches.length);
        } else {
            return nls.localizeByDefault('No results');
        }
    }

    private gotoNextMatch(): void {
        this.search({
            modifyIndex: (matches, index) => (index + 1) % matches.length,
            jumpToMatch: true
        });
    }

    private gotoPreviousMatch(): void {
        this.search({
            modifyIndex: (matches, index) => (index === 0 ? matches.length : index) - 1,
            jumpToMatch: true
        });
    }

    private replaceOne(): void {
        const existingMatches = this.state.matches;
        const match = existingMatches[this.state.currentMatch];
        if (match) {
            match.replace?.(this.state.replace);
            this.search({
                jumpToMatch: true,
                modifyIndex: (matches, index) => {
                    if (matches.length < existingMatches.length) {
                        return index % matches.length;
                    } else {
                        const diff = matches.length - existingMatches.length;
                        return (index + diff + 1) % matches.length;
                    }
                }
            });
        }
    }

    private replaceAll(): void {
        this.props.onReplace(this.state.matches, this.state.replace);
        this.search({});
    }

    override componentDidUpdate(prevProps: Readonly<NotebookFindWidgetProps>, prevState: Readonly<NotebookFindWidgetState>): void {
        if (!this.props.hidden && prevProps.hidden) {
            // Focus the search input when the widget switches from hidden to visible.
            this.searchRef.current?.focus();
        }
    }

    focusSearch(content?: string): void {
        this.searchRef.current?.focus();
        if (content) {
            this.search({
                search: content,
                jumpToMatch: false
            });
        }
    }

    search(options: NotebookEditorFindOptions): void {
        const matchCase = options.matchCase ?? this.state.matchCase;
        const wholeWord = options.wholeWord ?? this.state.wholeWord;
        const regex = options.regex ?? this.state.regex;
        const search = options.search ?? this.state.search;
        const matches = this.props.onSearch({
            search,
            matchCase,
            wholeWord,
            regex,
            activeFilters: this.state.activeFilters
        });
        let currentMatch = Math.max(0, Math.min(this.state.currentMatch, matches.length - 1));
        if (options.modifyIndex && matches.length > 0) {
            currentMatch = options.modifyIndex(matches, currentMatch);
        }
        const selectedMatch = matches[currentMatch];
        if (selectedMatch) {
            selectedMatch.selected = true;
            if (options.jumpToMatch) {
                selectedMatch.show();
            }
        }
        this.setState({
            search,
            matches,
            currentMatch,
            matchCase,
            wholeWord,
            regex
        });
    }

}
