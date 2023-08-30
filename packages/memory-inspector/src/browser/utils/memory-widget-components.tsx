/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 ********************************************************************************/

import { Key, KeyCode } from '@theia/core/lib/browser';
import * as React from '@theia/core/shared/react';
import { Interfaces } from './memory-widget-utils';

export interface MWLabelProps { id: string; label: string; disabled?: boolean; classNames?: string[] }

export const MWLabel: React.FC<MWLabelProps> = ({ id, label, disabled, classNames }) => {
    const additionalClassNames = classNames ? classNames.join(' ') : '';
    return <label htmlFor={id} className={`t-mv-label theia-header no-select ${additionalClassNames}${disabled ? ' disabled' : ''}`}>{label}</label>;
};

export interface InputProps<T extends HTMLElement = HTMLElement> {
    id: string;
    label: string;
    defaultValue?: string;
    value?: string;
    onChange?: React.EventHandler<React.ChangeEvent>;
    onKeyDown?: React.EventHandler<React.KeyboardEvent<HTMLInputElement>>;
    passRef?: React.ClassAttributes<T>['ref'];
    title?: string;
    disabled?: boolean;
    placeholder?: string;
}

export const MWInput: React.FC<InputProps<HTMLInputElement>> = ({ id, label, passRef, defaultValue, onChange, title, onKeyDown, disabled }) => (
    <>
        <MWLabel id={id} label={label} disabled={disabled} />
        <input
            tabIndex={0}
            type='text'
            ref={passRef}
            id={id}
            className='theia-input t-mv-input'
            defaultValue={defaultValue}
            onChange={onChange}
            onKeyDown={onKeyDown}
            title={title}
            spellCheck={false}
            disabled={disabled}
        />
    </>
);

export interface LabelAndSelectProps extends InputProps<HTMLSelectElement> {
    options: string[];
}

export const MWSelect: React.FC<LabelAndSelectProps> = ({ id, label, options, passRef, onChange, title, value, disabled }) => (
    <>
        <MWLabel id={id} label={label} disabled={disabled} />
        <select
            tabIndex={0}
            ref={passRef}
            id={id}
            className='theia-select t-mv-select'
            value={value}
            onChange={onChange}
            title={title}
            disabled={disabled}
        >
            {options.map(option => <option value={option} key={option}>{option}</option>)}
        </select>
    </>
);

export interface LabelAndSelectWithNameProps extends InputProps<HTMLSelectElement> {
    options: Array<[string, string]>;
}

export const MWSelectWithName: React.FC<LabelAndSelectWithNameProps> = ({ id, label, options, passRef, onChange, title, value, disabled }) => (
    <>
        <MWLabel id={id} label={label} disabled={disabled} />
        <select
            tabIndex={0}
            ref={passRef}
            id={id}
            className='theia-select'
            value={value}
            onChange={onChange}
            title={title}
            disabled={disabled}
        >
            {options.map(option => <option value={option[0]} key={option[0]}>{option[1]}</option>)}
        </select>
    </>
);

export interface InputWithSelectProps<T extends HTMLElement> extends InputProps<T> {
    options: string[];
    onSelectChange?(e: React.ChangeEvent): void;
    onInputChange?(e: React.ChangeEvent<HTMLInputElement>): void;
}
export const MWInputWithSelect: React.FC<InputWithSelectProps<HTMLInputElement>> = (
    { id, label, passRef, onKeyDown, title, options, onSelectChange, defaultValue, disabled, placeholder },
) => (
    <>
        <MWLabel id={id} label={label} disabled={disabled} />
        <div className='mw-input-select'>
            <input
                tabIndex={0}
                type='text'
                ref={passRef}
                id={id}
                className='theia-input t-mv-input'
                defaultValue={defaultValue}
                onKeyDown={onKeyDown}
                title={title}
                spellCheck={false}
                disabled={disabled}
                placeholder={placeholder}
            />
            <select
                className='theia-select t-mv-select'
                onChange={onSelectChange}
                disabled={disabled || (options.length === 0)}
            >
                {options.reverse().map(option => <option key={`'mw-input-select'-${id}-${option}`} value={option}>{option}</option>)}
            </select>
        </div>
    </>
);

export interface MoreMemoryProps {
    options: number[];
    direction: 'above' | 'below';
    handler(opts: Interfaces.MoreMemoryOptions): void;
}

export const MWMoreMemorySelect: React.FC<MoreMemoryProps> = ({ options, handler, direction }) => {
    const [numBytes, setNumBytes] = React.useState<number>(options[0]);
    const containerRef = React.createRef<HTMLDivElement>();
    const onSelectChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
        e.stopPropagation();
        const { value } = e.currentTarget;
        setNumBytes(parseInt(value));
    };

    const loadMoreMemory = (e: React.MouseEvent | React.KeyboardEvent): void => {
        containerRef.current?.blur();
        const doHandle = !('key' in e) || KeyCode.createKeyCode(e.nativeEvent).key?.keyCode === Key.ENTER.keyCode;
        if (doHandle) {
            handler({
                numBytes,
                direction,
            });
        }
    };

    return (
        <div
            className='mw-more-memory-select'
            tabIndex={0}
            role='button'
            onClick={loadMoreMemory}
            onKeyDown={loadMoreMemory}
            ref={containerRef}
        >
            <div className='mw-more-memory-select-top no-select'>
                Load
                <select
                    className='theia-select'
                    onChange={onSelectChange}
                    tabIndex={0}
                >
                    {options.map(option => (
                        <option
                            key={`mw-more-memory-select-${option}`}
                            value={option}
                        >
                            {option}
                        </option>))}
                </select>
                {`more bytes ${direction}`}
            </div>
        </div>
    );
};
