// *****************************************************************************
// Copyright (C) 2020 Ericsson and others.
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

import { codicon, ReactWidget, StatefulWidget, Widget } from '@theia/core/lib/browser';
import { injectable, postConstruct, unmanaged } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import debounce = require('p-debounce');
import { Emitter } from '@theia/core';
import { nls } from '@theia/core/lib/common/nls';

export interface PreferencesSearchbarState {
    searchTerm: string;
}

@injectable()
export class PreferencesSearchbarWidget extends ReactWidget implements StatefulWidget {
    static readonly ID = 'settings.header';
    static readonly LABEL = 'Settings Header';
    static readonly SEARCHBAR_ID = 'preference-searchbar';

    protected readonly onFilterStringChangedEmitter = new Emitter<string>();
    readonly onFilterChanged = this.onFilterStringChangedEmitter.event;

    protected searchbarRef: React.RefObject<HTMLInputElement> = React.createRef<HTMLInputElement>();
    protected resultsCount: number = 0;

    constructor(@unmanaged() options?: Widget.IOptions) {
        super(options);
        this.focus = this.focus.bind(this);
    }

    @postConstruct()
    protected init(): void {
        this.id = PreferencesSearchbarWidget.ID;
        this.title.label = PreferencesSearchbarWidget.LABEL;
        this.update();
    }

    protected handleSearch = (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => this.search(e.target.value);

    protected search = debounce(async (value: string) => {
        this.onFilterStringChangedEmitter.fire(value);
        this.update();
    }, 200);

    focus(): void {
        if (this.searchbarRef.current) {
            this.searchbarRef.current.focus();
        }
    }

    /**
     * Clears the search input and all search results.
     * @param e on-click mouse event.
     */
    protected clearSearchResults = async (e: React.MouseEvent): Promise<void> => {
        const search = document.getElementById(PreferencesSearchbarWidget.SEARCHBAR_ID) as HTMLInputElement;
        if (search) {
            search.value = '';
            await this.search(search.value);
            this.update();
        }
    };

    /**
     * Renders all search bar options.
     */
    protected renderOptionContainer(): React.ReactNode {
        const resultsCount = this.renderResultsCountOption();
        const clearAllOption = this.renderClearAllOption();
        return <div className="option-buttons"> {resultsCount} {clearAllOption} </div>;
    }

    /**
     * Renders a badge displaying search results count.
     */
    protected renderResultsCountOption(): React.ReactNode {
        let resultsFound: string;
        if (this.resultsCount === 0) {
            resultsFound = nls.localizeByDefault('No Settings Found');
        } else if (this.resultsCount === 1) {
            resultsFound = nls.localizeByDefault('1 Setting Found');
        } else {
            resultsFound = nls.localizeByDefault('{0} Settings Found', this.resultsCount.toFixed(0));
        }
        return this.searchTermExists() ?
            (<span
                className="results-found"
                title={resultsFound}>
                {resultsFound}
            </span>)
            : '';
    }

    /**
     * Renders a clear all button.
     */
    protected renderClearAllOption(): React.ReactNode {
        return <span
            className={`${codicon('clear-all')} option ${(this.searchTermExists() ? 'enabled' : '')}`}
            title={nls.localizeByDefault('Clear Search Results')}
            onClick={this.clearSearchResults}
        />;
    }

    /**
     * Determines whether the search input currently has a value.
     * @returns true, if the search input currently has a value; false, otherwise.
     */
    protected searchTermExists(): boolean {
        return !!this.searchbarRef.current?.value;
    }

    protected getSearchTerm(): string {
        const search = document.getElementById(PreferencesSearchbarWidget.SEARCHBAR_ID) as HTMLInputElement;
        return search?.value;
    }

    async updateSearchTerm(searchTerm: string): Promise<void> {
        const search = document.getElementById(PreferencesSearchbarWidget.SEARCHBAR_ID) as HTMLInputElement;
        if (!search || search.value === searchTerm) {
            return;
        }
        search.value = searchTerm;
        await this.search(search.value);
        this.update();
    }

    render(): React.ReactNode {
        const optionContainer = this.renderOptionContainer();
        return (
            <div className='settings-header'>
                <div className="settings-search-container" ref={this.focus}>
                    <input
                        type="text"
                        id={PreferencesSearchbarWidget.SEARCHBAR_ID}
                        spellCheck={false}
                        placeholder={nls.localizeByDefault('Search settings')}
                        className="settings-search-input theia-input"
                        onChange={this.handleSearch}
                        ref={this.searchbarRef}
                    />
                    {optionContainer}
                </div>
            </div >
        );
    }

    /**
     * Updates the search result count.
     * @param count the result count.
     */
    updateResultsCount(count: number): void {
        this.resultsCount = count;
        this.update();
    }

    storeState(): PreferencesSearchbarState {
        return {
            searchTerm: this.getSearchTerm()
        };
    }

    restoreState(oldState: PreferencesSearchbarState): void {
        const searchInputExists = this.onDidChangeVisibility(() => {
            this.updateSearchTerm(oldState.searchTerm || '');
            searchInputExists.dispose();
        });
    }
}
