// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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
import { PreferenceLeafNodeRenderer, PreferenceNodeRenderer } from './preference-node-renderer';
import { Preference } from '../../util/preference-types';
import { PreferenceLeafNodeRendererContribution } from './preference-node-renderer-creator';

@injectable()
/** For rendering preference items for which the only interesting feature is the description */
export class PreferenceNullInputRenderer extends PreferenceLeafNodeRenderer<null, HTMLElement> {
    protected override createInteractable(container: HTMLElement): void {
        const span = document.createElement('span');
        this.interactable = span;
        container.appendChild(span);
    }

    protected override getFallbackValue(): null {
        // eslint-disable-next-line no-null/no-null
        return null;
    }

    protected override doHandleValueChange(): void { }
}

@injectable()
export class PreferenceNullRendererContribution extends PreferenceLeafNodeRendererContribution {
    static ID = 'preference-null-renderer';
    id = PreferenceNullRendererContribution.ID;

    canHandleLeafNode(node: Preference.LeafNode): number {
        const isOnlyNull = node.preference.data.type === 'null' || Array.isArray(node.preference.data.type) && node.preference.data.type.every(candidate => candidate === 'null');
        return isOnlyNull ? 5 : 0;
    }

    createLeafNodeRenderer(container: interfaces.Container): PreferenceNodeRenderer {
        return container.get(PreferenceNullInputRenderer);
    }
}
