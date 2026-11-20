// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { injectable } from 'inversify';
import { Color } from '../common/color.js';
import { nls } from '../common/nls.js';
import { ColorContribution } from './color-application-contribution.js';
import { ColorRegistry } from './color-registry.js';

/**
 * Registers the `editorGutter.*Background` and `editorOverviewRuler.*Foreground` colors for modified, added and
 * deleted content. They live in core because they are used outside `@theia/scm` too, e.g. as the default of the
 * `successBackground` color and by the diff views of the AI packages.
 */
@injectable()
export class EditorGutterColorContribution implements ColorContribution {
    registerColors(colors: ColorRegistry): void {
        colors.register(
            {
                id: 'editorGutter.modifiedBackground', defaults: {
                    dark: '#1B81A8',
                    light: '#2090D3',
                    hcDark: '#1B81A8',
                    hcLight: '#2090D3'
                }, description: nls.localizeByDefault('Editor gutter background color for lines that are modified.')
            },
            {
                id: 'editorGutter.addedBackground', defaults: {
                    dark: '#487E02',
                    light: '#48985D',
                    hcDark: '#487E02',
                    hcLight: '#48985D'
                }, description: nls.localizeByDefault('Editor gutter background color for lines that are added.')
            },
            {
                id: 'editorGutter.deletedBackground', defaults: {
                    dark: 'editorError.foreground',
                    light: 'editorError.foreground',
                    hcDark: 'editorError.foreground',
                    hcLight: 'editorError.foreground'
                }, description: nls.localizeByDefault('Editor gutter background color for lines that are deleted.')
            },
            {
                id: 'editorOverviewRuler.modifiedForeground', defaults: {
                    dark: Color.transparent('editorGutter.modifiedBackground', 0.6),
                    light: Color.transparent('editorGutter.modifiedBackground', 0.6),
                    hcDark: Color.transparent('editorGutter.modifiedBackground', 0.6),
                    hcLight: Color.transparent('editorGutter.modifiedBackground', 0.6)
                }, description: nls.localizeByDefault('Overview ruler marker color for modified content.')
            },
            {
                id: 'editorOverviewRuler.addedForeground', defaults: {
                    dark: Color.transparent('editorGutter.addedBackground', 0.6),
                    light: Color.transparent('editorGutter.addedBackground', 0.6),
                    hcDark: Color.transparent('editorGutter.addedBackground', 0.6),
                    hcLight: Color.transparent('editorGutter.addedBackground', 0.6)
                }, description: nls.localizeByDefault('Overview ruler marker color for added content.')
            },
            {
                id: 'editorOverviewRuler.deletedForeground', defaults: {
                    dark: Color.transparent('editorGutter.deletedBackground', 0.6),
                    light: Color.transparent('editorGutter.deletedBackground', 0.6),
                    hcDark: Color.transparent('editorGutter.deletedBackground', 0.6),
                    hcLight: Color.transparent('editorGutter.deletedBackground', 0.6)
                }, description: nls.localizeByDefault('Overview ruler marker color for deleted content.')
            }
        );
    }
}
