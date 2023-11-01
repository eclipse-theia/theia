// *****************************************************************************
// Copyright (C) 2020 TypeFox and others.
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
import { injectable, postConstruct, inject } from '@theia/core/shared/inversify';
import { ReactWidget, Message, codicon } from '@theia/core/lib/browser/widgets';
import { PreferenceService } from '@theia/core/lib/browser';
import { VSXExtensionsSearchModel } from './vsx-extensions-search-model';
import { VSXExtensionsModel } from './vsx-extensions-model';
import { nls } from '@theia/core/lib/common/nls';

@injectable()
export class VSXExtensionsSearchBar extends ReactWidget {

    @inject(VSXExtensionsModel)
    protected readonly extensionsModel: VSXExtensionsModel;

    @inject(VSXExtensionsSearchModel)
    protected readonly searchModel: VSXExtensionsSearchModel;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    protected input: HTMLInputElement | undefined;
    protected onlyShowVerifiedExtensions: boolean | undefined;

    @postConstruct()
    protected init(): void {
        this.onlyShowVerifiedExtensions = this.preferenceService.get('extensions.onlyShowVerifiedExtensions');
        this.id = 'vsx-extensions-search-bar';
        this.addClass('theia-vsx-extensions-search-bar');
        this.searchModel.onDidChangeQuery((query: string) => this.updateSearchTerm(query));
        this.preferenceService.onPreferenceChanged(change => {
            if (change.preferenceName === 'extensions.onlyShowVerifiedExtensions') {
                this.extensionsModel.setOnlyShowVerifiedExtensions(!!change.newValue);
                this.onlyShowVerifiedExtensions = change.newValue;
                this.update();
            }
        });
    }

    protected render(): React.ReactNode {
        return <div className='vsx-search-container'>
            <input type='text'
                ref={input => this.input = input || undefined}
                defaultValue={this.searchModel.query}
                spellCheck={false}
                className='theia-input'
                placeholder={nls.localize('theia/vsx-registry/searchPlaceholder', 'Search Extensions in {0}', 'Open VSX Registry')}
                onChange={this.updateQuery}>
            </input>
            {this.renderOptionContainer()}
        </div>;
    }

    protected updateQuery = (e: React.ChangeEvent<HTMLInputElement>) => this.searchModel.query = e.target.value;

    protected updateSearchTerm(term: string): void {
        if (this.input) {
            this.input.value = term;
        }
    }

    protected renderOptionContainer(): React.ReactNode {
        const showVerifiedExtensions = this.renderShowVerifiedExtensions();
        return <div className='option-buttons'>{showVerifiedExtensions}</div>;
    }

    protected renderShowVerifiedExtensions(): React.ReactNode {
        return <span
            className={`${codicon('verified')} option action-label ${this.onlyShowVerifiedExtensions ? 'enabled' : ''}`}
            title={nls.localize('theia/vsx-registry/onlyShowVerifiedExtensionsTitle', 'Only Show Verified Extensions')}
            onClick={() => this.handleShowVerifiedExtensionsClick()}>
        </span>;
    }

    protected handleShowVerifiedExtensionsClick(): void {
        this.extensionsModel.setOnlyShowVerifiedExtensions(!this.onlyShowVerifiedExtensions);
        this.update();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        if (this.input) {
            this.input.focus();
        }
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.update();
    }

}
