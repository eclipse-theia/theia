// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { SearchBoxDebounce, SearchBoxDebounceOptions } from '../tree/search-box-debounce';
import { ReactWidget, codicon } from '../widgets';
import { Emitter, Event } from '../../common/event';
import { KeyCode, Key } from '../keyboard/keys';
import { nls } from '../../common/nls';
import * as React from 'react';

/**
 * Initializer properties for the search box widget.
 */
export interface SearchBoxProps extends SearchBoxDebounceOptions {

    /**
     * If `true`, the `Previous`, `Next`, and `Close` buttons will be visible. Otherwise, `false`. Defaults to `false`.
     */
    readonly showButtons?: boolean;

    /**
     * If `true`, `Filter` and `Close` buttons will be visible, and clicking the `Filter` button will triggers filter on the search term. Defaults to `false`.
     */
    readonly showFilter?: boolean;

}

export namespace SearchBoxProps {

    /**
     * The default search box widget option.
     */
    export const DEFAULT: SearchBoxProps = SearchBoxDebounceOptions.DEFAULT;

}

/**
 * The search box widget.
 */
export class SearchBox extends ReactWidget {

    protected static SPECIAL_KEYS = [
        Key.ESCAPE,
        Key.BACKSPACE
    ];

    protected static MAX_CONTENT_LENGTH = 15;

    protected readonly nextEmitter = new Emitter<void>();
    protected readonly previousEmitter = new Emitter<void>();
    protected readonly closeEmitter = new Emitter<void>();
    protected readonly textChangeEmitter = new Emitter<string | undefined>();
    protected readonly filterToggleEmitter = new Emitter<boolean>();
    protected _isFiltering: boolean = false;

    protected hasMatch: boolean = true;
    protected inputText: string = '';

    constructor(protected readonly props: SearchBoxProps,
        protected readonly debounce: SearchBoxDebounce) {

        super();
        this.toDispose.pushAll([
            this.nextEmitter,
            this.previousEmitter,
            this.closeEmitter,
            this.textChangeEmitter,
            this.filterToggleEmitter,
            this.debounce,
            this.debounce.onChanged(data => this.fireTextChange(data))
        ]);
        this.hide();
        this.addClass('theia-search-box-widget');
        this.node.setAttribute('tabIndex', '0');
    }

    get onPrevious(): Event<void> {
        return this.previousEmitter.event;
    }

    get onNext(): Event<void> {
        return this.nextEmitter.event;
    }

    get onClose(): Event<void> {
        return this.closeEmitter.event;
    }

    get onTextChange(): Event<string | undefined> {
        return this.textChangeEmitter.event;
    }

    get onFilterToggled(): Event<boolean> {
        return this.filterToggleEmitter.event;
    }

    get isFiltering(): boolean {
        return this._isFiltering;
    }

    get keyCodePredicate(): KeyCode.Predicate {
        return this.canHandle.bind(this);
    }

    protected firePrevious(): void {
        this.previousEmitter.fire(undefined);
    }

    protected fireNext(): void {
        this.nextEmitter.fire(undefined);
    }

    protected fireClose(): void {
        this.closeEmitter.fire(undefined);
    }

    protected fireTextChange(input: string | undefined): void {
        this.textChangeEmitter.fire(input);
    }

    protected fireFilterToggle(): void {
        this.doFireFilterToggle();
    }

    protected doFireFilterToggle(toggleTo: boolean = !this._isFiltering): void {
        this._isFiltering = toggleTo;
        this.filterToggleEmitter.fire(toggleTo);
        this.update();
    }

    handle(event: KeyboardEvent): void {
        event.preventDefault();
        const keyCode = KeyCode.createKeyCode(event);
        if (this.canHandle(keyCode)) {
            if (Key.equals(Key.ESCAPE, keyCode) || this.isCtrlBackspace(keyCode)) {
                this.hide();
            } else {
                this.show();
                this.handleKey(keyCode);
            }
        }
    }

    protected handleArrowUp(): void {
        this.firePrevious();
    }

    protected handleArrowDown(): void {
        this.fireNext();
    }

    override onBeforeHide(): void {
        this.hasMatch = true;
        this.doFireFilterToggle(false);
        this.inputText = '';
        this.debounce.append(undefined);
        this.fireClose();
    }

    protected handleKey(keyCode: KeyCode): void {
        const character = Key.equals(Key.BACKSPACE, keyCode) ? '\b' : keyCode.character;
        const data = this.debounce.append(character);
        if (data) {
            this.inputText = data;
            this.update();
        } else {
            this.hide();
        }
    }

    protected getTrimmedContent(data: string): string {
        if (data.length > SearchBox.MAX_CONTENT_LENGTH) {
            return '...' + data.substring(data.length - SearchBox.MAX_CONTENT_LENGTH);
        }
        return data;
    }

    protected canHandle(keyCode: KeyCode | undefined): boolean {
        if (keyCode === undefined) {
            return false;
        }
        const { ctrl, alt, meta } = keyCode;
        if (this.isCtrlBackspace(keyCode)) {
            return true;
        }
        if (ctrl || alt || meta || keyCode.key === Key.SPACE) {
            return false;
        }
        if (keyCode.character || (this.isVisible && SearchBox.SPECIAL_KEYS.some(key => Key.equals(key, keyCode)))) {
            return true;
        }
        return false;
    }

    protected isCtrlBackspace(keyCode: KeyCode): boolean {
        if (keyCode.ctrl && Key.equals(Key.BACKSPACE, keyCode)) {
            return true;
        }
        return false;
    }

    updateHighlightInfo(info: SearchBox.HighlightInfo): void {
        if (info.filterText && info.filterText.length > 0) {
            this.hasMatch = info.matched > 0;
            this.update();
        }
    }

    protected render(): React.ReactNode {
        const displayText = this.inputText ? this.getTrimmedContent(this.inputText) : '';

        return (
            <div className={`theia-search-box${this.hasMatch ? '' : ' no-match'}`}>
                <span className={'theia-search-input'}>
                    {displayText}
                </span>
                <div className={'theia-search-buttons-wrapper'}>
                    {this.props.showFilter &&
                        <div
                            className={`theia-search-button action-label ${this.isFiltering ? codicon('list-filter') : codicon('list-selection')}`}
                            title={this.isFiltering ?
                                nls.localize('theia/core/searchbox/showAll', 'Show all items') :
                                nls.localize('theia/core/searchbox/showOnlyMatching', 'Show only matching items')}
                            onClick={() => this.fireFilterToggle()}
                        />}
                    {this.props.showButtons &&
                        <>
                            <div
                                className={`theia-search-button ${this.hasMatch ? 'action-label' : 'no-match'} ${codicon('find-previous-match')}`}
                                title={nls.localize('theia/core/searchbox/previous', 'Previous (Up)')}
                                onClick={() => this.hasMatch && this.firePrevious()}
                            />
                            <div
                                className={`theia-search-button ${this.hasMatch ? 'action-label' : 'no-match'} ${codicon('find-next-match')}`}
                                title={nls.localize('theia/core/searchbox/next', 'Next (Down)')}
                                onClick={() => this.hasMatch && this.fireNext()}
                            />
                        </>}
                    {(this.props.showButtons || this.props.showFilter) &&
                        <div
                            className={`theia-search-button action-label ${codicon('widget-close')}`}
                            title={nls.localize('theia/core/searchbox/close', 'Close (Escape)')}
                            onClick={() => this.hide()}
                        />}
                </div>
            </div>
        );
    }

}

export namespace SearchBox {
    export interface HighlightInfo {
        filterText: string | undefined,
        matched: number,
        total: number
    }
}

/**
 * Search box factory.
 */
export const SearchBoxFactory = Symbol('SearchBoxFactory');
export interface SearchBoxFactory {

    /**
     * Creates a new search box with the given initializer properties.
     */
    (props: SearchBoxProps): SearchBox;

}
