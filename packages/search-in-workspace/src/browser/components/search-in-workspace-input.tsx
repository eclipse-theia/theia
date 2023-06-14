// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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
import { Key, KeyCode } from '@theia/core/lib/browser';
import debounce = require('@theia/core/shared/lodash.debounce');

interface HistoryState {
    history: string[];
    index: number;
};
type InputAttributes = React.InputHTMLAttributes<HTMLInputElement>;

export class SearchInWorkspaceInput extends React.Component<InputAttributes, HistoryState> {
    static LIMIT = 100;

    private input = React.createRef<HTMLInputElement>();

    constructor(props: InputAttributes) {
        super(props);
        this.state = {
            history: [],
            index: 0,
        };
    }

    updateState(index: number, history?: string[]): void {
        this.value = history ? history[index] : this.state.history[index];
        this.setState(prevState => {
            const newState = {
                ...prevState,
                index,
            };
            if (history) {
                newState.history = history;
            }
            return newState;
        });
    }

    get value(): string {
        return this.input.current?.value ?? '';
    }

    set value(value: string) {
        if (this.input.current) {
            this.input.current.value = value;
        }
    }

    /**
     * Handle history navigation without overriding the parent's onKeyDown handler, if any.
     */
    protected readonly onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
        if (Key.ARROW_UP.keyCode === KeyCode.createKeyCode(e.nativeEvent).key?.keyCode) {
            e.preventDefault();
            this.previousValue();
        } else if (Key.ARROW_DOWN.keyCode === KeyCode.createKeyCode(e.nativeEvent).key?.keyCode) {
            e.preventDefault();
            this.nextValue();
        }
        this.props.onKeyDown?.(e);
    };

    /**
     * Switch the input's text to the previous value, if any.
     */
    previousValue(): void {
        const { history, index } = this.state;
        if (!this.value) {
            this.value = history[index];
        } else if (index > 0 && index < history.length) {
            this.updateState(index - 1);
        }
    }

    /**
     * Switch the input's text to the next value, if any.
     */
    nextValue(): void {
        const { history, index } = this.state;
        if (index === history.length - 1) {
            this.value = '';
        } else if (!this.value) {
            this.value = history[index];
        } else if (index >= 0 && index < history.length - 1) {
            this.updateState(index + 1);
        }
    }

    /**
     * Handle history collection without overriding the parent's onChange handler, if any.
     */
    protected readonly onChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.addToHistory();
        this.props.onChange?.(e);
    };

    /**
     * Add a nonempty current value to the history, if not already present. (Debounced, 1 second delay.)
     */
    readonly addToHistory = debounce(this.doAddToHistory, 1000);

    private doAddToHistory(): void {
        if (!this.value) {
            return;
        }
        const history = this.state.history
            .filter(term => term !== this.value)
            .concat(this.value)
            .slice(-SearchInWorkspaceInput.LIMIT);
        this.updateState(history.length - 1, history);
    }

    override render(): React.ReactNode {
        return (
            <input
                {...this.props}
                onKeyDown={this.onKeyDown}
                onChange={this.onChange}
                spellCheck={false}
                ref={this.input}
            />
        );
    }
}
