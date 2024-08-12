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

import { inject, injectable } from '@theia/core/shared/inversify';
import { LabelProviderContribution, TreeNode } from '@theia/core/lib/browser';
import { Preference } from './preference-types';
import { PreferenceLayoutProvider } from './preference-layout';

@injectable()
export class PreferenceTreeLabelProvider implements LabelProviderContribution {

    @inject(PreferenceLayoutProvider)
    protected readonly layoutProvider: PreferenceLayoutProvider;

    canHandle(element: object): number {
        return TreeNode.is(element) && Preference.TreeNode.is(element) ? 150 : 0;
    }

    getName(node: Preference.TreeNode): string {
        if (Preference.TreeNode.is(node) && node.label) {
            return node.label;
        }
        const { id } = Preference.TreeNode.getGroupAndIdFromNodeId(node.id);
        const labels = id.split('.');
        const groupName = labels[labels.length - 1];
        return this.formatString(groupName);
    }

    getPrefix(node: Preference.TreeNode, fullPath = false): string | undefined {
        const { depth } = node;
        const { id, group } = Preference.TreeNode.getGroupAndIdFromNodeId(node.id);
        const segments = id.split('.');
        const segmentsHandled = group === segments[0] ? depth : depth - 1;
        segments.pop(); // Ignore the leaf name.
        const prefixSegments = fullPath ? segments : segments.slice(segmentsHandled);
        if (prefixSegments.length) {
            let output = prefixSegments.length > 1 ? `${this.formatString(prefixSegments[0])} › ` : `${this.formatString(prefixSegments[0])}: `;
            for (const segment of prefixSegments.slice(1)) {
                output += `${this.formatString(segment)}: `;
            }
            return output;
        }
    }

    protected formatString(string: string): string {
        let formattedString = string[0].toLocaleUpperCase();
        for (let i = 1; i < string.length; i++) {
            if (this.isUpperCase(string[i]) && !/\s/.test(string[i - 1]) && !this.isUpperCase(string[i - 1])) {
                formattedString += ' ';
            }
            formattedString += string[i];
        }
        return formattedString.trim();
    }

    protected isUpperCase(char: string): boolean {
        return char === char.toLocaleUpperCase() && char.toLocaleLowerCase() !== char.toLocaleUpperCase();
    }
}
