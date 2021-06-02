/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ContextKeyService, ContextKey } from '@theia/core/lib/browser/context-key-service';

@injectable()
export class SearchInWorkspaceContextKeyService {

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    protected _searchViewletVisible: ContextKey<boolean>;
    get searchViewletVisible(): ContextKey<boolean> {
        return this._searchViewletVisible;
    }

    protected _searchViewletFocus: ContextKey<boolean>;
    get searchViewletFocus(): ContextKey<boolean> {
        return this._searchViewletFocus;
    }

    protected searchInputBoxFocus: ContextKey<boolean>;
    setSearchInputBoxFocus(searchInputBoxFocus: boolean): void {
        this.searchInputBoxFocus.set(searchInputBoxFocus);
        this.updateInputBoxFocus();
    }

    protected replaceInputBoxFocus: ContextKey<boolean>;
    setReplaceInputBoxFocus(replaceInputBoxFocus: boolean): void {
        this.replaceInputBoxFocus.set(replaceInputBoxFocus);
        this.updateInputBoxFocus();
    }

    protected patternIncludesInputBoxFocus: ContextKey<boolean>;
    setPatternIncludesInputBoxFocus(patternIncludesInputBoxFocus: boolean): void {
        this.patternIncludesInputBoxFocus.set(patternIncludesInputBoxFocus);
        this.updateInputBoxFocus();
    }

    protected patternExcludesInputBoxFocus: ContextKey<boolean>;
    setPatternExcludesInputBoxFocus(patternExcludesInputBoxFocus: boolean): void {
        this.patternExcludesInputBoxFocus.set(patternExcludesInputBoxFocus);
        this.updateInputBoxFocus();
    }

    protected inputBoxFocus: ContextKey<boolean>;
    protected updateInputBoxFocus(): void {
        this.inputBoxFocus.set(
            this.searchInputBoxFocus.get() ||
            this.replaceInputBoxFocus.get() ||
            this.patternIncludesInputBoxFocus.get() ||
            this.patternExcludesInputBoxFocus.get()
        );
    }

    protected _replaceActive: ContextKey<boolean>;
    get replaceActive(): ContextKey<boolean> {
        return this._replaceActive;
    }

    protected _hasSearchResult: ContextKey<boolean>;
    get hasSearchResult(): ContextKey<boolean> {
        return this._hasSearchResult;
    }

    @postConstruct()
    protected init(): void {
        this._searchViewletVisible = this.contextKeyService.createKey<boolean>('searchViewletVisible', false);
        this._searchViewletFocus = this.contextKeyService.createKey<boolean>('searchViewletFocus', false);
        this.inputBoxFocus = this.contextKeyService.createKey<boolean>('inputBoxFocus', false);
        this.searchInputBoxFocus = this.contextKeyService.createKey<boolean>('searchInputBoxFocus', false);
        this.replaceInputBoxFocus = this.contextKeyService.createKey<boolean>('replaceInputBoxFocus', false);
        this.patternIncludesInputBoxFocus = this.contextKeyService.createKey<boolean>('patternIncludesInputBoxFocus', false);
        this.patternExcludesInputBoxFocus = this.contextKeyService.createKey<boolean>('patternExcludesInputBoxFocus', false);
        this._replaceActive = this.contextKeyService.createKey<boolean>('replaceActive', false);
        this._hasSearchResult = this.contextKeyService.createKey<boolean>('hasSearchResult', false);
    }

}
