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
import * as React from 'react';
import { debounce } from 'lodash';
import { Disposable } from '@theia/languages/lib/browser';
import { PreferencesEventService } from '../util/preference-event-service';

@injectable()
export class PreferencesSearchbarWidget extends ReactWidget {
    static readonly ID = 'settings.header';
    static readonly LABEL = 'Settings Header';

    protected searchbarRef: React.RefObject<HTMLInputElement> = React.createRef<HTMLInputElement>();

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
        this.update();
    }, 200);

    focus(): void {
        if (this.searchbarRef.current) {
            this.searchbarRef.current.focus();
        }
    }

    render(): React.ReactNode {
        return (
            <div className='settings-header'>
                <div className="settings-search-container">
                    <input
                        type="text"
                        placeholder="Search Settings"
                        className="settings-search-input theia-input"
                        onChange={this.handleSearch}
                        ref={this.searchbarRef}
                    />
                </div>
            </div >
        );
    }
}
