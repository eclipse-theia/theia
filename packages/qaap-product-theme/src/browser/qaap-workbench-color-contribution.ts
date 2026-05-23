// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { ColorRegistry } from '@theia/core/lib/browser/color-registry';
import { Color } from '@theia/core/lib/common/color';

/**
 * Cursor-like status bar defaults (product layer; overrides {@link CommonFrontendContribution}
 * upstream colors). Qaap palette overrides are NOT registered here on purpose:
 * they must apply ONLY to the Qaap-branded "Light (Qaap)" / "Dark (Qaap)" themes
 * and not to marketplace themes or High Contrast, so they live as scoped CSS in
 * `style/qaap-tokens.css` instead (toggled by {@link QaapThemeContribution}).
 */
@injectable()
export class QaapWorkbenchColorContribution implements ColorContribution {

    registerColors(colors: ColorRegistry): void {
        colors.register(
            {
                id: 'statusBar.foreground', defaults: {
                    dark: '#CCCCCC',
                    light: '#333333',
                    hcDark: '#FFFFFF',
                    hcLight: 'editor.foreground'
                }, description: 'Status bar foreground color when a workspace is opened.'
            },
            {
                id: 'statusBar.background', defaults: {
                    dark: '#181818',
                    light: '#FFFFFF',
                    hcDark: '#181818',
                    hcLight: '#FFFFFF'
                }, description: 'Status bar background color when a workspace is opened.'
            },
            {
                id: 'statusBar.noFolderBackground', defaults: {
                    dark: '#181818',
                    light: '#FFFFFF',
                    hcDark: '#181818',
                    hcLight: '#FFFFFF'
                }, description: 'Status bar background color when no folder is opened.'
            },
            {
                id: 'statusBar.border', defaults: {
                    dark: '#303031',
                    light: '#E5E5E5',
                    hcDark: 'contrastBorder',
                    hcLight: 'contrastBorder'
                }, description: 'Status bar border color.'
            },
            {
                id: 'statusBarItem.activeBackground', defaults: {
                    dark: Color.rgba(255, 255, 255, 0.18),
                    light: Color.rgba(0, 0, 0, 0.12),
                    hcDark: Color.rgba(255, 255, 255, 0.18),
                    hcLight: Color.rgba(0, 0, 0, 0.18)
                }, description: 'Status bar item background color when clicking.'
            },
            {
                id: 'statusBarItem.hoverBackground', defaults: {
                    dark: Color.rgba(255, 255, 255, 0.12),
                    light: Color.rgba(0, 0, 0, 0.08),
                    hcDark: Color.rgba(255, 255, 255, 0.12),
                    hcLight: Color.rgba(0, 0, 0, 0.12)
                }, description: 'Status bar item background color when hovering.'
            },
            {
                id: 'statusBarItem.compactHoverBackground', defaults: {
                    dark: Color.rgba(255, 255, 255, 0.20),
                    light: Color.rgba(0, 0, 0, 0.10),
                    hcDark: Color.rgba(255, 255, 255, 0.20),
                    hcLight: Color.rgba(0, 0, 0, 0.20)
                }, description: 'Status bar item compact hover background.'
            }
        );
    }
}
