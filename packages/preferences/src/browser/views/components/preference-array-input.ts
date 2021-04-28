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

@injectable()
export class PreferenceArrayInputRenderer extends PreferenceLeafNodeRenderer<string[], HTMLInputElement> {
    existingValues = new Map<string, { node: HTMLElement, index: number }>();
    wrapper: HTMLElement;
    inputWrapper: HTMLElement;

    protected createInteractable(parent: HTMLElement): void {
        const wrapper = document.createElement('ul');
        wrapper.classList.add('preference-array');
        this.wrapper = wrapper;
        const currentValue = this.getValue();
        if (Array.isArray(currentValue)) {
            for (const [index, value] of currentValue.entries()) {
                const node = this.createExistingValue(value);
                wrapper.appendChild(node);
                this.existingValues.set(value, { node, index });
            }
        }
        const inputWrapper = this.createInput();
        wrapper.appendChild(inputWrapper);
        parent.appendChild(wrapper);
    }

    protected getFallbackValue(): string[] {
        return [];
    }

    protected createExistingValue(value: string): HTMLElement {
        const existingValue = document.createElement('li');
        existingValue.classList.add('preference-array-element');
        const valueWrapper = document.createElement('span');
        valueWrapper.classList.add('preference-array-element-val');
        valueWrapper.textContent = value;
        existingValue.appendChild(valueWrapper);
        const iconWrapper = document.createElement('span');
        iconWrapper.classList.add('preference-array-element-btn', 'remove-btn');
        const handler = this.removeItem.bind(this, value);
        iconWrapper.onclick = handler;
        iconWrapper.onkeydown = handler;
        iconWrapper.setAttribute('role', 'button');
        iconWrapper.tabIndex = 0;
        existingValue.appendChild(iconWrapper);
        const icon = document.createElement('i');
        icon.classList.add('preference-array-clear-item');
        iconWrapper.appendChild(icon);
        return existingValue;
    }

    protected createInput(): HTMLElement {
        const inputWrapper = document.createElement('li');
        this.inputWrapper = inputWrapper;
        const input = document.createElement('input');
        inputWrapper.appendChild(input);
        this.interactable = input;
        input.classList.add('preference-array-input', 'theia-input');
        input.type = 'text';
        input.placeholder = 'Add Value...';
        input.onkeydown = this.handleEnter.bind(this);
        input.setAttribute('aria-label', 'Preference String Input');
        const iconWrapper = document.createElement('span');
        inputWrapper.appendChild(iconWrapper);
        iconWrapper.classList.add('preference-array-element-btn', 'add-btn');
        iconWrapper.setAttribute('role', 'button');
        const handler = this.addItem.bind(this);
        iconWrapper.onclick = handler;
        iconWrapper.onkeydown = handler;
        iconWrapper.tabIndex = 0;
        iconWrapper.setAttribute('aria-label', 'Submit Preference Input');
        const icon = document.createElement('i');
        icon.classList.add('fa', 'fa-plus');
        iconWrapper.appendChild(icon);
        return inputWrapper;
    }

    protected doHandleValueChange(): void {
        this.updateInspection();
        const values = this.getValue();
        const newValues = new Set(...values);
        for (const [value, row] of this.existingValues.entries()) {
            if (!newValues.has(value)) {
                row.node.remove();
                this.existingValues.delete(value);
            }
        }
        for (const [index, value] of values.entries()) {
            let row = this.existingValues.get(value);
            if (row) {
                row.index = index;
            } else {
                row = { node: this.createExistingValue(value), index };
                this.existingValues.set(value, row);
            }

            if (this.wrapper.children[index] !== row.node) {
                this.wrapper.children[index].insertAdjacentElement('beforebegin', row.node);
            }
        }
        this.updateModificationStatus();
    }

    protected removeItem(value: string): void {
        const row = this.existingValues.get(value);
        if (row) {
            row.node.remove();
            this.existingValues.delete(value);
            this.setPreferenceImmediately(this.getOrderedValues());
        }
    }

    protected handleEnter(e: KeyboardEvent): void {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.addItem();
        }
    }

    protected addItem(): void {
        const newItem = this.interactable.value;
        if (newItem && !this.existingValues.has(newItem)) {
            const node = this.createExistingValue(newItem);
            this.inputWrapper.insertAdjacentElement('beforebegin', node);
            this.existingValues.set(newItem, { node, index: this.existingValues.size });
            this.setPreferenceImmediately(this.getOrderedValues());
        }
        this.interactable.value = '';
    }

    protected getOrderedValues(): string[] {
        return Array.from(this.existingValues.entries())
            .sort(([, a], [, b]) => a.index - b.index)
            .map(([value]) => value);
    }

    dispose(): void {
        this.existingValues.clear();
        super.dispose();
    }
}
