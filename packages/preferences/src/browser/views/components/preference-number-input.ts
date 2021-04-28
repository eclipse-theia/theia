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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import { PreferenceLeafNodeRenderer } from './preference-node-renderer';

interface PreferenceNumberInputValidation {
    /**
     * the numeric value of the input. `NaN` if there is an error.
     */
    value: number;
    /**
     * the error message to display.
     */
    message: string;
}

@injectable()
export class PreferenceNumberInputRenderer extends PreferenceLeafNodeRenderer<number, HTMLInputElement> {

    protected _errorMessage: HTMLElement | undefined;
    protected interactableWrapper: HTMLElement;

    get errorMessage(): HTMLElement {
        if (!this._errorMessage) {
            const errorMessage = document.createElement('div');
            errorMessage.classList.add('pref-error-notification');
            this._errorMessage = errorMessage;
        }
        return this._errorMessage;
    }

    protected createInteractable(parent: HTMLElement): void {
        const interactableWrapper = document.createElement('div');
        this.interactableWrapper = interactableWrapper;
        interactableWrapper.classList.add('pref-input-container');
        const interactable = document.createElement('input');
        this.interactable = interactable;
        interactable.type = 'number';
        interactable.classList.add('theia-input');
        interactable.defaultValue = this.getValue().toString();
        interactable.oninput = this.handleUserInteraction.bind(this);
        interactable.onblur = this.handleBlur.bind(this);
        interactableWrapper.appendChild(interactable);
        parent.appendChild(interactableWrapper);
    }

    protected getFallbackValue(): number {
        return 0;
    }

    protected handleUserInteraction(): void {
        const { value, message } = this.getInputValidation(this.interactable.value);
        if (isNaN(value)) {
            this.showErrorMessage(message);
        } else {
            this.hideErrorMessage();
            this.setPreferenceWithDebounce(value);
        }
    }

    protected async handleBlur(): Promise<void> {
        this.hideErrorMessage();
        await this.setPreferenceWithDebounce.flush();
        this.handleValueChange();
    }

    protected doHandleValueChange(): void {
        const { value } = this.interactable;
        const currentValue = value.length ? Number(value) : NaN;
        this.updateInspection();
        const newValue = this.getValue();
        this.updateModificationStatus(newValue);
        if (newValue !== currentValue) {
            if (document.activeElement !== this.interactable) {
                this.interactable.value = newValue.toString();
            } else {
                this.handleUserInteraction(); // give priority to the value of the input if it is focused.
            }
        }
    }

    protected getInputValidation(input: string): PreferenceNumberInputValidation {
        const { preference: { data } } = this.preferenceNode;
        const inputValue = Number(input);
        const errorMessages: string[] = [];

        if (input === '' || isNaN(inputValue)) {
            return { value: NaN, message: 'Value must be a number.' };
        }
        if (data.minimum && inputValue < data.minimum) {
            errorMessages.push(`Value must be greater than or equal to ${data.minimum}.`);
        };
        if (data.maximum && inputValue > data.maximum) {
            errorMessages.push(`Value must be less than or equal to ${data.maximum}.`);
        };
        if (data.type === 'integer' && !Number.isInteger(inputValue)) {
            errorMessages.push('Value must be an integer.');
        }

        return {
            value: errorMessages.length ? NaN : inputValue,
            message: errorMessages.join(' ')
        };
    }

    protected showErrorMessage(message: string): void {
        this.errorMessage.textContent = message;
        this.interactableWrapper.appendChild(this.errorMessage);
    }

    protected hideErrorMessage(): void {
        this.errorMessage.remove();
    }
}
