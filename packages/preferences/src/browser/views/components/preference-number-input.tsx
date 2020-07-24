
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

interface PreferenceNumberInputProps {
    preferenceDisplayNode: Preference.NodeWithValueInSingleScope;
    setPreference(preferenceName: string, preferenceValue: number): void;
}

export const PreferenceNumberInput: React.FC<PreferenceNumberInputProps> = ({ preferenceDisplayNode, setPreference }) => {
    const { id } = preferenceDisplayNode;
    const { data, value } = preferenceDisplayNode.preference;

    const externalValue = (value !== undefined ? value : data.defaultValue) || '';

    const [currentTimeout, setCurrentTimetout] = React.useState<number>(0);
    const [currentValue, setCurrentValue] = React.useState<string>(externalValue);
    const [validationMessage, setValidationMessage] = React.useState<string>('');

    React.useEffect(() => {
        setCurrentValue(externalValue);
    }, [externalValue]);

    const onBlur = React.useCallback(() => {
        setCurrentValue(externalValue);
        setValidationMessage('');
    }, [externalValue]);

    const onChange = React.useCallback(e => {
        clearTimeout(currentTimeout);
        const { value: newValue } = e.target;
        setCurrentValue(newValue);
        const preferenceValue: number = Number(newValue);
        const { isValid, message } = getInputValidation(preferenceValue);
        setValidationMessage(message);
        if (isValid) {
            const newTimeout = setTimeout(() => setPreference(id, preferenceValue), 750);
            setCurrentTimetout(Number(newTimeout));
        }
    }, [currentTimeout]);

    /**
     * Validates the input.
     * @param input the input value.
     */
    const getInputValidation = (input: number | undefined): { isValid: boolean, message: string } => {
        const errorMessages: string[] = [];
        if (!input) {
            return { isValid: false, message: 'Value must be a number.' };
        };
        if (data.minimum && input < data.minimum) {
            errorMessages.push(`Value must be greater than or equal to ${data.minimum}.`);
        };
        if (data.maximum && input > data.maximum) {
            errorMessages.push(`Value must be less than or equal to ${data.maximum}.`);
        };
        if (data.type === 'integer' && input % 1 !== 0) {
            errorMessages.push('Value must be an integer.');
        }
        return { isValid: !errorMessages.length, message: errorMessages.join(' ') };
    };

    return (
        <div className='pref-input-container'>
            <input
                type="number"
                className="theia-input"
                pattern="[0-9]*"
                value={currentValue}
                onChange={onChange}
                onBlur={onBlur}
                data-preference-id={id}
            />
            {!!validationMessage.length ? <div className='pref-error-notification'>{validationMessage}</div> : undefined}
        </div>
    );
};
