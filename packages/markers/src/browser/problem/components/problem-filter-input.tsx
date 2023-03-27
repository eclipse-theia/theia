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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { nls } from '@theia/core/lib/common/nls';
import debounce = require('@theia/core/shared/lodash.debounce');
import { Key, KeyCode } from '@theia/core/lib/browser';

export interface ProblemFilterInputProps {
    onChange?: (e?: React.ChangeEvent<HTMLInputElement>, value?: string) => void;
    onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

export const ProblemFilterInput: React.FC<ProblemFilterInputProps> = (props: ProblemFilterInputProps) => {
    const LIMIT = 100;
    const FILTER_PLACEHOLDER = nls.localizeByDefault('Filter (e.g. text, **/*.ts, !**/node_modules/**)');
    const inputRef = React.useRef<HTMLInputElement>();
    const { onChange, onKeyDown } = props;
    const [placeholder, setPlaceholder] = React.useState(FILTER_PLACEHOLDER);
    const [history, setHistory] = React.useState<string[]>([]);
    const [index, setIndex] = React.useState(0);

    const resetPlaceholder = (showHistory: boolean) => {
        if (showHistory) {
            setPlaceholder(FILTER_PLACEHOLDER + ' or \u21C5 for history');
        } else {
            setPlaceholder(FILTER_PLACEHOLDER);
        }
    };
    const updateState = (_index: number, _history?: string[]) => {
        const value = _history ? _history[_index] : history[_index];
        if (inputRef.current) {
            inputRef.current.value = value;
        }
        if (_history) {
            setHistory(_history);
        }
        setIndex(_index);
    };

    const doAddToHistory = () => {
        if (!(inputRef.current && inputRef.current.value)) { return; }
        const value = inputRef.current.value;
        const newHistory = history.filter(term => term !== value)
            .concat(value)
            .slice(-LIMIT);

        updateState(newHistory.length - 1, newHistory);
    };
    const addToHistory = debounce(doAddToHistory, 1000);

    const changeHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
        const text = inputRef.current?.value || '';
        addToHistory();
        onChange?.(e, text);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (Key.ARROW_UP.keyCode === KeyCode.createKeyCode(e.nativeEvent).key?.keyCode) {
            e.preventDefault();
            previousValue();
        } else if (Key.ARROW_DOWN.keyCode === KeyCode.createKeyCode(e.nativeEvent).key?.keyCode) {
            e.preventDefault();
            nextValue();
        }
        onKeyDown?.(e);
    };

    const previousValue = () => {
        if (!inputRef.current) { return; }
        const value = inputRef.current.value;
        if (!value) {
            inputRef.current.value = history[index] ?? '';
        } else if (index > 0 && index < history.length) {
            updateState(index - 1, undefined);
        }

        onChange?.(undefined, inputRef.current.value);
    };

    const nextValue = () => {
        if (!inputRef.current) { return; }
        const value = inputRef.current.value;
        if (index === history.length - 1) {
            inputRef.current.value = '';

        } else if (!value) {
            inputRef.current.value = history[index] ?? '';

        } else if (index >= 0 && index < history.length - 1) {
            updateState(index + 1, undefined);
        }

        onChange?.(undefined, inputRef.current.value);
    };

    return <input
        className='theia-input filter-input'
        title={FILTER_PLACEHOLDER}
        placeholder={placeholder}
        spellCheck={false}
        ref={inputRef as React.MutableRefObject<HTMLInputElement>}
        onChange={changeHandler}
        onFocus={() => resetPlaceholder(true)}
        onBlur={() => resetPlaceholder(false)}
        onKeyDown={handleKeyDown}
    />;
};
