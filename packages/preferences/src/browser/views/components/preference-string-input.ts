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

import { injectable, interfaces } from '@theia/core/shared/inversify';
import { Preference } from '../../util/preference-types';
import { PreferenceLeafNodeRenderer, PreferenceNodeRenderer } from './preference-node-renderer';
import { PreferenceLeafNodeRendererContribution } from './preference-node-renderer-creator';

@injectable()
export class PreferenceStringInputRenderer extends PreferenceLeafNodeRenderer<string, HTMLInputElement> {
    protected createInteractable(parent: HTMLElement): void {
        const interactable = document.createElement('input');
        this.interactable = interactable;
        interactable.type = 'text';
        interactable.spellcheck = false;
        interactable.classList.add('theia-input');
        interactable.defaultValue = this.getValue() ?? '';
        interactable.oninput = this.handleUserInteraction.bind(this);
        interactable.onblur = this.handleBlur.bind(this);
        parent.appendChild(interactable);
    }

    protected getFallbackValue(): string {
        return '';
    }

    protected doHandleValueChange(): void {
        const currentValue = this.interactable.value;
        this.updateInspection();
        const newValue = this.getValue() ?? '';
        this.updateModificationStatus(newValue);
        if (newValue !== currentValue) {
            if (document.activeElement !== this.interactable) {
                this.interactable.value = newValue;
            } else {
                this.handleUserInteraction(); // give priority to the value of the input if it is focused.
            }
        }
    }

    protected handleUserInteraction(): void {
        this.setPreferenceWithDebounce(this.interactable.value);
    }

    protected async handleBlur(): Promise<void> {
        await this.setPreferenceWithDebounce.flush();
        this.handleValueChange();
    }
}

@injectable()
export class PreferenceStringInputRendererContribution extends PreferenceLeafNodeRendererContribution {
    static ID = 'preference-string-input-renderer';
    id = PreferenceStringInputRendererContribution.ID;

    canHandleLeafNode(node: Preference.LeafNode): number {
        return Preference.LeafNode.getType(node) === 'string' ? 2 : 0;
    }

    createLeafNodeRenderer(container: interfaces.Container): PreferenceNodeRenderer {
        return container.get(PreferenceStringInputRenderer);
    }
}
