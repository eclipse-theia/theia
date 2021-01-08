/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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
import { ReactWidget } from '@theia/core/lib/browser';
import { Disposable } from '@theia/core/lib/common/disposable';
import * as React from 'react';
import { debounce } from 'lodash';
import { PreferencesEventService } from '../util/preference-event-service';

@injectable()
export class PreferencesSearchbarWidget extends ReactWidget {
    static readonly ID = 'settings.header';
    static readonly LABEL = 'Settings Header';
    static readonly SEARCHBAR_ID = 'preference-searchbar';

    protected searchbarRef: React.RefObject<HTMLInputElement> = React.createRef<HTMLInputElement>();
    protected searchCount: number = 0;

    @inject(PreferencesEventService) protected readonly preferencesEventService: PreferencesEventService;

    @postConstruct()
    protected init(): void {
        this.onRender.push(Disposable.create(() => this.focus()));
        this.id = PreferencesSearchbarWidget.ID;
        this.title.label = PreferencesSearchbarWidget.LABEL;
        this.update();
    }

    protected handleSearch = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.search(e.target.value);
    };

    protected search = debounce((value: string) => {
        this.preferencesEventService.onSearch.fire({ query: value });
        this.preferencesEventService.onResultChanged.event(count => this.searchCount = count);
        this.update();
    }, 200);

    focus(): void {
        if (this.searchbarRef.current) {
            this.searchbarRef.current.focus();
        }
    }

    protected clearSearchResults = (e: React.MouseEvent): void => {
        const search = document.getElementById(PreferencesSearchbarWidget.SEARCHBAR_ID) as HTMLInputElement;
        if (search) {
            search.value = '';
            this.search(search.value);
            this.update();
        }
    };

    protected renderOptionContainer(): React.ReactNode {
        const resultsCount = this.renderResultsCount();
        const clearAllOption = this.renderOptionElement();
        return <div className="option-buttons"> {resultsCount} {clearAllOption} </div>;
    }

    protected renderResultsCount(): React.ReactNode {
        return this.searchTermExists() ?
            (<span
                className="results-found"
                title={`${this.searchCount} Settings Found`}> {this.searchCount === 0 ? 'No' : this.searchCount} Settings Found
            </span>)
            : '';
    }

    protected renderOptionElement(): React.ReactNode {
        return <span
            className={`clear-all option ${(this.searchTermExists() ? 'enabled' : '')}`}
            title="Clear Search Results"
            onClick={e => this.clearSearchResults(e)}
        />;
    }

    /**
     * Determines whether the search input currently has a value.
     * @returns `true` if the search input currently has a value.
     */
    protected searchTermExists(): boolean {
        return (this.searchbarRef.current?.value !== '' && this.searchbarRef.current?.value !== undefined);
    }

    render(): React.ReactNode {
        const optionContainer = this.renderOptionContainer();
        return (
            <div className="settings-search-container">
                <input
                    type="text"
                    id={PreferencesSearchbarWidget.SEARCHBAR_ID}
                    placeholder="Search Settings"
                    className="settings-search-input theia-input"
                    onChange={this.handleSearch}
                    ref={this.searchbarRef}
                />
                {optionContainer}
            </div>
        );
    }
}
