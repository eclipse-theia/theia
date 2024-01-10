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
export class PreferenceBooleanInputRenderer extends PreferenceLeafNodeRenderer<boolean, HTMLInputElement> {
    protected createInteractable(parent: HTMLElement): void {
        const interactable = document.createElement('input');
        this.interactable = interactable;
        interactable.type = 'checkbox';
        interactable.classList.add('theia-input');
        interactable.defaultChecked = Boolean(this.getValue());
        interactable.onchange = this.handleUserInteraction.bind(this);
        parent.appendChild(interactable);
    }

    protected override getAdditionalNodeClassnames(): Iterable<string> {
        return ['boolean'];
    }

    protected getFallbackValue(): false {
        return false;
    }

    protected handleUserInteraction(): Promise<void> {
        return this.setPreferenceImmediately(this.interactable.checked);
    }

    protected doHandleValueChange(): void {
        const currentValue = this.interactable.checked;
        this.updateInspection();
        const newValue = Boolean(this.getValue());
        this.updateModificationStatus(newValue);
        if (newValue !== currentValue && document.activeElement !== this.interactable) {
            this.interactable.checked = newValue;
        }
    }
}

@injectable()
export class PreferenceBooleanInputRendererContribution extends PreferenceLeafNodeRendererContribution {
    static ID = 'preference-boolean-input-renderer';
    id = PreferenceBooleanInputRendererContribution.ID;

    canHandleLeafNode(node: Preference.LeafNode): number {
        return Preference.LeafNode.getType(node) === 'boolean' ? 2 : 0;
    }

    createLeafNodeRenderer(container: interfaces.Container): PreferenceNodeRenderer {
        return container.get(PreferenceBooleanInputRenderer);
    }
}
