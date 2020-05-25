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

import * as React from 'react';
import { Preference } from '../../util/preference-types';

interface PreferenceBooleanInputProps {
    preferenceDisplayNode: Preference.NodeWithValueInSingleScope;
    setPreference: (preferenceName: string, preferenceValue: boolean) => void;
}

export const PreferenceBooleanInput: React.FC<PreferenceBooleanInputProps> = ({ preferenceDisplayNode, setPreference }) => {
    const { id } = preferenceDisplayNode;
    const value = typeof preferenceDisplayNode.preference.value === 'boolean' ? preferenceDisplayNode.preference.value : undefined;

    // Tracks local state for quicker refreshes on user click.
    const [checked, setChecked] = React.useState<boolean>(!!value);

    // Allows user to reset value using cogwheel.
    React.useEffect(() => {
        setChecked(!!value);
    }, [value]);

    const setValue = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setChecked(!checked);
        setPreference(id, e.target.checked);
    }, [checked]);

    return (
        <label htmlFor={`preference-checkbox-${id}`}>
            <input
                type="checkbox"
                className="theia-input"
                checked={checked}
                readOnly={false}
                onChange={setValue}
                id={`preference-checkbox-${id}`}
                data-preference-id={id}
            />
        </label>
    );
};
