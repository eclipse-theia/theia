/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { SearchBoxDebounce, SearchBoxDebounceOptions } from '../tree/search-box-debounce';
import { BaseWidget, Message } from '../widgets/widget';
import { Emitter, Event } from '../../common/event';
import { KeyCode, Key } from '../keyboard/keys';

/**
 * Initializer properties for the search box widget.
 */
export interface SearchBoxProps extends SearchBoxDebounceOptions {

    /**
     * If `true`, the `Previous`, `Next`, and `Close` buttons will be visible. Otherwise, `false`. Defaults to `false`.
     */
    readonly showButtons?: boolean;

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
export class SearchBox extends BaseWidget {

    protected static SPECIAL_KEYS = [
        Key.ESCAPE,
        Key.BACKSPACE
    ];

    protected readonly nextEmitter = new Emitter<void>();
    protected readonly previousEmitter = new Emitter<void>();
    protected readonly closeEmitter = new Emitter<void>();
    protected readonly textChangeEmitter = new Emitter<string | undefined>();
    protected readonly input: HTMLInputElement;

    constructor(protected readonly props: SearchBoxProps,
        protected readonly debounce: SearchBoxDebounce) {

        super();
        this.toDispose.pushAll([
            this.nextEmitter,
            this.previousEmitter,
            this.closeEmitter,
            this.textChangeEmitter,
            this.debounce,
            this.debounce.onChanged(data => this.fireTextChange(data))
        ]);
        this.hide();
        this.update();
        const { input } = this.createContent();
        this.input = input;
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

    handle(event: KeyboardEvent): void {
        const keyCode = KeyCode.createKeyCode(event);
        if (this.canHandle(keyCode)) {
            if (Key.equals(Key.ESCAPE, keyCode)) {
                this.hide();
            } else {
                this.show();
                this.handleKey(keyCode);
            }
        }
    }

    protected handleArrowUp() {
        this.firePrevious();
    }

    protected handleArrowDown() {
        this.fireNext();
    }

    onBeforeHide(): void {
        this.debounce.append(undefined);
        this.fireClose();
    }

    protected handleKey(keyCode: KeyCode) {
        const character = Key.equals(Key.BACKSPACE, keyCode) ? '\b' : keyCode.character;
        const data = this.debounce.append(character);
        if (data) {
            this.input.value = data;
            this.update();
        } else {
            this.hide();
        }
    }

    protected canHandle(keyCode: KeyCode | undefined): boolean {
        if (keyCode === undefined) {
            return false;
        }
        const { ctrl, alt, meta } = keyCode;
        if (ctrl || alt || meta) {
            return false;
        }
        if (keyCode.character || (this.isVisible && SearchBox.SPECIAL_KEYS.some(key => Key.equals(key, keyCode)))) {
            return true;
        }
        return false;
    }

    protected createContent(): {
        container: HTMLElement,
        input: HTMLInputElement,
        previous: HTMLElement | undefined,
        next: HTMLElement | undefined,
        close: HTMLElement | undefined
    } {

        this.addClass(SearchBox.Styles.SEARCH_BOX);

        const input = document.createElement('input');
        input.readOnly = true;
        input.type = 'text';
        input.classList.add(
            SearchBox.Styles.SEARCH_INPUT,
            SearchBox.Styles.NON_SELECTABLE
        );
        this.node.appendChild(input);

        let previous: HTMLElement | undefined;
        let next: HTMLElement | undefined;
        let close: HTMLElement | undefined;

        if (!!this.props.showButtons) {
            previous = document.createElement('div');
            previous.classList.add(
                SearchBox.Styles.BUTTON,
                SearchBox.Styles.BUTTON_PREVIOUS
            );
            previous.title = 'Previous (Up)';
            this.node.appendChild(previous);
            previous.onclick = () => this.firePrevious.bind(this)();

            next = document.createElement('div');
            next.classList.add(
                SearchBox.Styles.BUTTON,
                SearchBox.Styles.BUTTON_NEXT
            );
            next.title = 'Next (Down)';
            this.node.appendChild(next);
            next.onclick = () => this.fireNext.bind(this)();

            close = document.createElement('div');
            close.classList.add(
                SearchBox.Styles.BUTTON,
                SearchBox.Styles.BUTTON_CLOSE
            );
            close.title = 'Close (Escape)';
            this.node.appendChild(close);
            close.onclick = () => this.hide.bind(this)();
        }

        return {
            container: this.node,
            input,
            previous,
            next,
            close
        };

    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        // tslint:disable-next-line:no-any
        this.addEventListener(this.input, 'selectstart' as any, () => false);
    }

}

export namespace SearchBox {

    /**
     * CSS classes for the search box widget.
     */
    export namespace Styles {

        export const SEARCH_BOX = 'theia-search-box';
        export const SEARCH_INPUT = 'theia-search-input';
        export const BUTTON = 'theia-search-button';
        export const BUTTON_PREVIOUS = 'theia-search-button-previous';
        export const BUTTON_NEXT = 'theia-search-button-next';
        export const BUTTON_CLOSE = 'theia-search-button-close';
        export const NON_SELECTABLE = 'theia-non-selectable';

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
