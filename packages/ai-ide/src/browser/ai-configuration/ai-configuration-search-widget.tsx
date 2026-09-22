// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
import { Emitter, Event, nls } from '@theia/core';
import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { codicon, ReactWidget } from '@theia/core/lib/browser';

/**
 * The search box above the category tree. It emits {@link onDidChangeFilter} so the tree can
 * live-filter its nodes; filtering the tree is the only search affordance.
 */
@injectable()
export class AiConfigurationSearchWidget extends ReactWidget {

    static readonly ID = 'ai-configuration-search';

    protected readonly onDidChangeFilterEmitter = new Emitter<string>();
    readonly onDidChangeFilter: Event<string> = this.onDidChangeFilterEmitter.event;

    protected readonly onDidRequestExpandAllEmitter = new Emitter<void>();
    /** Fired by the "Expand All" toolbar button below the search input. */
    readonly onDidRequestExpandAll: Event<void> = this.onDidRequestExpandAllEmitter.event;

    protected readonly onDidRequestCollapseAllEmitter = new Emitter<void>();
    /** Fired by the "Collapse All" toolbar button below the search input. */
    readonly onDidRequestCollapseAll: Event<void> = this.onDidRequestCollapseAllEmitter.event;

    /** Whether the tree has any expandable category, and whether all of them are currently expanded. */
    protected hasExpandable = false;
    protected allExpanded = false;

    @postConstruct()
    protected init(): void {
        this.id = AiConfigurationSearchWidget.ID;
        this.addClass('ai-configuration-search');
        this.toDispose.push(this.onDidChangeFilterEmitter);
        this.toDispose.push(this.onDidRequestExpandAllEmitter);
        this.toDispose.push(this.onDidRequestCollapseAllEmitter);
        this.update();
    }

    /** Updates the expand/collapse-all toggle to reflect the tree's current expansion. */
    setTreeExpansion(hasExpandable: boolean, allExpanded: boolean): void {
        if (this.hasExpandable !== hasExpandable || this.allExpanded !== allExpanded) {
            this.hasExpandable = hasExpandable;
            this.allExpanded = allExpanded;
            this.update();
        }
    }

    protected onExpandAll = (): void => this.onDidRequestExpandAllEmitter.fire();
    protected onCollapseAll = (): void => this.onDidRequestCollapseAllEmitter.fire();
    protected onQueryChange = (query: string): void => this.onDidChangeFilterEmitter.fire(query);

    protected render(): React.ReactNode {
        return <React.Fragment>
            {/* The input owns its value via React state so the caret is preserved while typing; a
                ReactWidget re-render (e.g. the toolbar toggle below) would otherwise reset the caret. */}
            <AiConfigurationSearchInput onQueryChange={this.onQueryChange} />
            {this.hasExpandable && <div className='ai-configuration-tree-toolbar'>
                {/* A single contextual toggle: Collapse All while everything is expanded, Expand All otherwise. */}
                {this.allExpanded
                    ? <button
                        type='button'
                        className={`ai-configuration-tree-toolbar-button ${codicon('collapse-all')}`}
                        title={nls.localizeByDefault('Collapse All')}
                        onClick={this.onCollapseAll}
                    ></button>
                    : <button
                        type='button'
                        className={`ai-configuration-tree-toolbar-button ${codicon('expand-all')}`}
                        title={nls.localizeByDefault('Expand All')}
                        onClick={this.onExpandAll}
                    ></button>}
            </div>}
        </React.Fragment>;
    }
}

/**
 * The search box, as a functional component so its value lives in React state. Typing therefore preserves
 * the caret position (editing mid-string no longer jumps to the end, which happened when the enclosing
 * ReactWidget re-rendered the controlled input out of band). Notifies the owner via {@link onQueryChange}.
 */
const AiConfigurationSearchInput: React.FC<{ onQueryChange: (query: string) => void }> = ({ onQueryChange }) => {
    const [query, setQuery] = React.useState('');
    const change = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        setQuery(event.target.value);
        onQueryChange(event.target.value);
    }, [onQueryChange]);
    const clear = React.useCallback(() => {
        setQuery('');
        onQueryChange('');
    }, [onQueryChange]);
    const onKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape' && query.length > 0) {
            event.preventDefault();
            clear();
        }
    }, [query, clear]);
    const clearLabel = nls.localizeByDefault('Clear');
    return <div className='ai-configuration-search-wrap'>
        <span className={`ai-configuration-search-icon ${codicon('search')}`}></span>
        <input
            className='theia-input ai-configuration-search-input'
            type='text'
            spellCheck={false}
            placeholder={nls.localize('theia/ai/core/aiConfiguration/searchPlaceholder', 'Search AI settings')}
            value={query}
            onChange={change}
            onKeyDown={onKeyDown}
        />
        {query.length > 0 && <button
            type='button'
            className={`ai-configuration-search-clear ${codicon('close')}`}
            title={clearLabel}
            aria-label={clearLabel}
            onClick={clear}
        ></button>}
    </div>;
};
