// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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

import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { ColorRegistry } from '@theia/core/lib/browser/color-registry';
import { Color } from '@theia/core/lib/common/color';
import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class NotebookColorContribution implements ColorContribution {
    registerColors(colors: ColorRegistry): void {
        colors.register({
            id: 'notebook.focusedEditorBorder',
            defaults: {
                dark: 'focusBorder',
                light: 'focusBorder',
                hcDark: 'focusBorder',
                hcLight: 'focusBorder'
            },
            description: 'The color of the notebook cell editor border.'
        }, {
            id: 'notebook.cellBorderColor',
            defaults: {
                dark: Color.transparent('list.inactiveSelectionBackground', 1),
                light: Color.transparent('list.inactiveSelectionBackground', 1),
                hcDark: 'panel.border',
                hcLight: 'panel.border'
            },
            description: 'The border color for notebook cells.'
        }, {
            id: 'notebook.cellEditorBackground',
            defaults: {
                dark: 'sideBar.background',
                light: 'sideBar.background',
                hcDark: undefined,
                hcLight: undefined
            },
            description: 'Cell editor background color.'
        }, {
            id: 'notebook.editorBackground',
            defaults: {
                dark: 'editorPane.background',
                light: 'editorPane.background',
                hcDark: undefined,
                hcLight: undefined
            },
            description: 'Notebook background color.'
        });
    }
}
