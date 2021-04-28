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

import { PreferenceLeafNodeRenderer } from './preference-node-renderer';
import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class PreferenceSelectInputRenderer extends PreferenceLeafNodeRenderer<string, HTMLSelectElement> {
    protected createInteractable(parent: HTMLElement): void {
        const options = this.preferenceNode.preference.data.enum!;
        const interactable = document.createElement('select');
        this.interactable = interactable;
        interactable.classList.add('theia-select');
        interactable.onchange = this.handleUserInteraction.bind(this);
        for (const value of options) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            interactable.appendChild(option);
        }
        interactable.value = this.getValue();
        parent.appendChild(interactable);
    }

    protected getFallbackValue(): string {
        return this.preferenceNode.preference.data.enum![0];
    }

    protected doHandleValueChange(): void {
        const currentValue = this.interactable.value || undefined;
        this.updateInspection();
        const newValue = this.getValue();
        this.updateModificationStatus(newValue);
        if (newValue !== currentValue && document.activeElement !== this.interactable) {
            this.interactable.value = newValue;
        }
    }

    protected handleUserInteraction(): void {
        this.setPreferenceImmediately(this.interactable.value || undefined);
    }
}
