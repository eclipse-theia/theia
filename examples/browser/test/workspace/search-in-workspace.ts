/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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

import { TopPanel } from '../top-panel/top-panel';
import { LeftPanel } from '../left-panel/left-panel';

export class SearchInWorkspace {

    /** selectors */
    private readonly _searchField = '#search-input-field';
    private readonly _includeField = '#include-glob-field';
    private readonly _excludeField = '#exclude-glob-field';

    private readonly _searchInfo = '#search-info';
    private readonly _options = '#search-details-btn';

    private readonly topPanel: TopPanel;
    private readonly leftPanel: LeftPanel;

    constructor(protected readonly driver: WebdriverIO.Client<void>) {
        this.topPanel = new TopPanel(driver);
        this.leftPanel = new LeftPanel(driver);
    }

    get searchField() {
        return $(this._searchField);
    }

    get includeField() {
        return $(this._includeField);
    }

    get excludeField() {
        return $(this._excludeField);
    }

    get searchInfo() {
        return $(this._searchInfo);
    }

    get searchOptions() {
        return $(this._options);
    }

    private clearSearchField(): void {
        this.searchField.clearElement();
    }

    private clearIncludeField(): void {
        this.includeField.clearElement();
    }

    private clearExcludeField(): void {
        this.excludeField.clearElement();
    }

    /**
     * Clear search input fields.
     */
    clear(): void {
        this.clearSearchField();
        this.clearIncludeField();
        this.clearExcludeField();
    }

    /**
     * Open search options used for advanced searching.
     */
    openSearchOptions(): void {
        this.searchOptions.click();
        this.driver.pause(1000);
    }

    /**
     * Perform a search-in-workspace search.
     *
     * @param term the search term.
     * @param includeGlog the include_glob (used to narrow down a search to include specific file(s)/folder(s)).
     * @param excludeGlog the exclude_glob (used to narrow down a search to exclude specific file(s)/folder(s)).
     *
     * @returns the search information details.
     */
    search(term: string, includeGlog?: string, excludeGlog?: string): string {

        // ensure search-in-workspace widget is opened and visible
        if (!this.leftPanel.isSearchViewVisible()) {
            this.topPanel.toggleSearchView();
            this.leftPanel.waitForSearchViewVisible();
        }

        // open search options (for advanced searches) if not already opened
        if (!this.includeField.isVisible() || !this.excludeField.isVisible()) {
            this.openSearchOptions();
        }

        // clear pre-exisitng input if present
        this.clear();

        // add include_glob to search if preset
        if (includeGlog) {
            this.includeField.addValue(includeGlog);
        }

        // add exclude_glob to search if present
        if (excludeGlog) {
            this.excludeField.addValue(excludeGlog);
        }

        // perform search, returning the search meta information
        this.searchField.addValue(term);
        this.driver.pause(5000);
        return this.searchInfo.getText();
    }

}
