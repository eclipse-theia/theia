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
        colors.register(
            {
                id: 'notebook.cellBorderColor',
                defaults: {
                    dark: Color.transparent('list.inactiveSelectionBackground', 1),
                    light: Color.transparent('list.inactiveSelectionBackground', 1),
                    hcDark: 'panel.border',
                    hcLight: 'panel.border'
                },
                description: 'The border color for notebook cells.'
            },
            {
                id: 'notebook.focusedEditorBorder',
                defaults: {
                    dark: 'focusBorder',
                    light: 'focusBorder',
                    hcDark: 'focusBorder',
                    hcLight: 'focusBorder'
                },
                description: 'The color of the notebook cell editor border.'
            },
            {
                id: 'notebookStatusSuccessIcon.foreground',
                defaults: {
                    dark: 'debugIcon.startForeground',
                    light: 'debugIcon.startForeground',
                    hcDark: 'debugIcon.startForeground',
                    hcLight: 'debugIcon.startForeground'
                },
                description: 'The error icon color of notebook cells in the cell status bar.'
            },
            {
                id: 'notebookEditorOverviewRuler.runningCellForeground',
                defaults: {
                    dark: 'debugIcon.startForeground',
                    light: 'debugIcon.startForeground',
                    hcDark: 'debugIcon.startForeground',
                    hcLight: 'debugIcon.startForeground'
                },
                description: 'The color of the running cell decoration in the notebook editor overview ruler.'
            },
            {
                id: 'notebookStatusErrorIcon.foreground',
                defaults: {
                    dark: 'errorForeground',
                    light: 'errorForeground',
                    hcDark: 'errorForeground',
                    hcLight: 'errorForeground'
                },
                description: 'The error icon color of notebook cells in the cell status bar.'
            },
            {
                id: 'notebookStatusRunningIcon.foreground',
                defaults: {
                    dark: 'foreground',
                    light: 'foreground',
                    hcDark: 'foreground',
                    hcLight: 'foreground'
                },
                description: 'The running icon color of notebook cells in the cell status bar.'
            },
            {
                id: 'notebook.outputContainerBorderColor',
                defaults: {
                    dark: undefined,
                    light: undefined,
                    hcDark: undefined,
                    hcLight: undefined
                },
                description: 'The border color of the notebook output container.'
            },
            {
                id: 'notebook.outputContainerBackgroundColor',
                defaults: {
                    dark: undefined,
                    light: undefined,
                    hcDark: undefined,
                    hcLight: undefined
                },
                description: 'The color of the notebook output container background.'
            },
            {
                id: 'notebook.cellToolbarSeparator',
                defaults: {
                    dark: Color.rgba(128, 128, 128, 0.35),
                    light: Color.rgba(128, 128, 128, 0.35),
                    hcDark: 'contrastBorder',
                    hcLight: 'contrastBorder'
                },
                description: 'The color of the separator in the cell bottom toolbar'
            },
            {
                id: 'notebook.focusedCellBackground',
                defaults: {
                    dark: undefined,
                    light: undefined,
                    hcDark: undefined,
                    hcLight: undefined
                },
                description: 'The background color of a cell when the cell is focused.'
            },
            {
                id: 'notebook.selectedCellBackground',
                defaults: {
                    dark: 'list.inactiveSelectionBackground',
                    light: 'list.inactiveSelectionBackground',
                    hcDark: undefined,
                    hcLight: undefined
                },
                description: 'The background color of a cell when the cell is selected.'
            },
            {
                id: 'notebook.cellHoverBackground',
                defaults: {
                    dark: Color.transparent('notebook.focusedCellBackground', 0.5),
                    light: Color.transparent('notebook.focusedCellBackground', 0.7),
                    hcDark: undefined,
                    hcLight: undefined
                },
                description: 'The background color of a cell when the cell is hovered.'
            },
            {
                id: 'notebook.selectedCellBorder',
                defaults: {
                    dark: 'notebook.cellBorderColor',
                    light: 'notebook.cellBorderColor',
                    hcDark: 'contrastBorder',
                    hcLight: 'contrastBorder'
                },
                description: "The color of the cell's top and bottom border when the cell is selected but not focused."
            },
            {
                id: 'notebook.inactiveSelectedCellBorder',
                defaults: {
                    dark: undefined,
                    light: undefined,
                    hcDark: 'focusBorder',
                    hcLight: 'focusBorder'
                },
                description: "The color of the cell's borders when multiple cells are selected."
            },
            {
                id: 'notebook.focusedCellBorder',
                defaults: {
                    dark: 'focusBorder',
                    light: 'focusBorder',
                    hcDark: 'focusBorder',
                    hcLight: 'focusBorder'
                },
                description: "The color of the cell's focus indicator borders when the cell is focused."
            },
            {
                id: 'notebook.inactiveFocusedCellBorder',
                defaults: {
                    dark: 'notebook.cellBorderColor',
                    light: 'notebook.cellBorderColor',
                    hcDark: 'notebook.cellBorderColor',
                    hcLight: 'notebook.cellBorderColor'
                },
                description: "The color of the cell's top and bottom border when a cell is focused while the primary focus is outside of the editor."
            },
            {
                id: 'notebook.cellStatusBarItemHoverBackground',
                defaults: {
                    dark: Color.rgba(0, 0, 0, 0.08),
                    light: Color.rgba(255, 255, 255, 0.15),
                    hcDark: Color.rgba(0, 0, 0, 0.08),
                    hcLight: Color.rgba(255, 255, 255, 0.15)
                },
                description: 'The background color of notebook cell status bar items.'
            },
            {
                id: 'notebook.cellInsertionIndicator',
                defaults: {
                    dark: 'focusBorder',
                    light: 'focusBorder',
                    hcDark: 'focusBorder',
                    hcLight: undefined
                },
                description: 'Notebook background color.'
            },
            {
                id: 'notebookScrollbarSlider.background',
                defaults: {
                    dark: 'scrollbarSlider.background',
                    light: 'scrollbarSlider.background',
                    hcDark: 'scrollbarSlider.background',
                    hcLight: 'scrollbarSlider.background'
                },
                description: 'Notebook scrollbar slider background color.'
            },
            {
                id: 'notebookScrollbarSlider.hoverBackground',
                defaults: {
                    dark: 'scrollbarSlider.hoverBackground',
                    light: 'scrollbarSlider.hoverBackground',
                    hcDark: 'scrollbarSlider.hoverBackground',
                    hcLight: 'scrollbarSlider.hoverBackground'
                },
                description: 'Notebook scrollbar slider background color when hovering.'
            },
            {
                id: 'notebookScrollbarSlider.activeBackground',
                defaults: {
                    dark: 'scrollbarSlider.activeBackground',
                    light: 'scrollbarSlider.activeBackground',
                    hcDark: 'scrollbarSlider.activeBackground',
                    hcLight: 'scrollbarSlider.activeBackground'
                },
                description: 'Notebook scrollbar slider background color when clicked on.'
            },
            {
                id: 'notebook.symbolHighlightBackground',
                defaults: {
                    dark: Color.rgba(255, 255, 255, 0.04),
                    light: Color.rgba(253, 255, 0, 0.2),
                    hcDark: undefined,
                    hcLight: undefined
                },
                description: 'Background color of highlighted cell'
            },
            {
                id: 'notebook.cellEditorBackground',
                defaults: {
                    dark: 'sideBar.background',
                    light: 'sideBar.background',
                    hcDark: undefined,
                    hcLight: undefined
                },
                description: 'Cell editor background color.'
            },
            {
                id: 'notebook.editorBackground',
                defaults: {
                    dark: 'editorPane.background',
                    light: 'editorPane.background',
                    hcDark: undefined,
                    hcLight: undefined
                },
                description: 'Notebook background color.'
            }
        );
    }
}
