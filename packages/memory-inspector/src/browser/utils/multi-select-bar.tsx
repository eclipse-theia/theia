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

import * as React from '@theia/core/shared/react';
import { MWLabel, MWLabelProps } from './memory-widget-components';

export interface SingleSelectItemProps {
    id: string;
    label: string;
    defaultChecked?: boolean;
}
interface MultiSelectBarProps {
    items: SingleSelectItemProps[];
    id?: string;
    onSelectionChanged: (labelSelected: string, newSelectionState: boolean) => unknown;
}

export const MultiSelectBar: React.FC<MultiSelectBarProps> = ({ items, onSelectionChanged, id }) => {
    const changeHandler: React.ChangeEventHandler<HTMLInputElement> = React.useCallback(e => {
        onSelectionChanged(e.target.id, e.target.checked);
    }, [onSelectionChanged]);

    return (
        <div className='multi-select-bar' id={id}>
            {items.map(({ label, id: itemId, defaultChecked }) => (<LabeledCheckbox
                label={label}
                onChange={changeHandler}
                defaultChecked={!!defaultChecked}
                id={itemId}
                key={`${label}-${id}-checkbox`}
            />))}
        </div>
    );
};

interface LabeledCheckboxProps {
    label: string;
    id: string;
    onChange: React.ChangeEventHandler;
    defaultChecked: boolean;
}

const LabeledCheckbox: React.FC<LabeledCheckboxProps> = ({ defaultChecked, label, onChange, id }) => (
    <div className='multi-select-checkbox-wrapper'>
        <input
            tabIndex={0}
            type='checkbox'
            id={id}
            className='multi-select-checkbox'
            defaultChecked={defaultChecked}
            onChange={onChange}
        />
        <MWLabel id={id} label={label} classNames={['multi-select-label']} />
    </div>
);

export const MWMultiSelect: React.FC<MWLabelProps & MultiSelectBarProps> = ({ id, label, disabled, items, onSelectionChanged }) => (
    <>
        <MWLabel id={id} label={label} disabled={disabled} />
        <MultiSelectBar id={id} items={items} onSelectionChanged={onSelectionChanged} />
    </>
);
