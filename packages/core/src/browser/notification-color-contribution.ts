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
 * Registers the `notification*` colors. They live in core because they are used outside the notifications
 * of `@theia/messages` too, e.g. by the editor's language status hover and AI warnings.
 */
@injectable()
export class NotificationColorContribution implements ColorContribution {
    registerColors(colors: ColorRegistry): void {
        colors.register(
            {
                id: 'notificationCenter.border', defaults: {
                    hcDark: 'contrastBorder',
                    hcLight: 'contrastBorder'
                }, description: nls.localizeByDefault('Notifications center border color. Notifications slide in from the bottom right of the window.')
            },
            {
                id: 'notificationToast.border', defaults: {
                    hcDark: 'contrastBorder',
                    hcLight: 'contrastBorder'
                }, description: nls.localizeByDefault('Notification toast border color. Notifications slide in from the bottom right of the window.')
            },
            {
                id: 'notifications.foreground', defaults: {
                    dark: 'editorWidget.foreground',
                    light: 'editorWidget.foreground',
                    hcDark: 'editorWidget.foreground',
                    hcLight: 'editorWidget.foreground'
                }, description: nls.localizeByDefault('Notifications foreground color. Notifications slide in from the bottom right of the window.')
            },
            {
                id: 'notifications.background', defaults: {
                    dark: 'editorWidget.background',
                    light: 'editorWidget.background',
                    hcDark: 'editorWidget.background',
                    hcLight: 'editorWidget.background'
                }, description: nls.localizeByDefault('Notifications background color. Notifications slide in from the bottom right of the window.')
            },
            {
                id: 'notificationLink.foreground', defaults: {
                    dark: 'textLink.foreground',
                    light: 'textLink.foreground',
                    hcDark: 'textLink.foreground',
                    hcLight: 'textLink.foreground'
                }, description: nls.localizeByDefault('Notification links foreground color. Notifications slide in from the bottom right of the window.')
            },
            {
                id: 'notificationCenterHeader.foreground',
                description: nls.localizeByDefault('Notifications center header foreground color. Notifications slide in from the bottom right of the window.')
            },
            {
                id: 'notificationCenterHeader.background', defaults: {
                    dark: Color.lighten('notifications.background', 0.3),
                    light: Color.darken('notifications.background', 0.05),
                    hcDark: 'notifications.background',
                    hcLight: 'notifications.background'
                }, description: nls.localizeByDefault('Notifications center header background color. Notifications slide in from the bottom right of the window.')
            },
            {
                id: 'notifications.border', defaults: {
                    dark: 'notificationCenterHeader.background',
                    light: 'notificationCenterHeader.background',
                    hcDark: 'notificationCenterHeader.background',
                    hcLight: 'notificationCenterHeader.background'
                }, description: nls.localizeByDefault(
                    'Notifications border color separating from other notifications in the notifications center. Notifications slide in from the bottom right of the window.'
                )
            },
            {
                id: 'notificationsErrorIcon.foreground', defaults: {
                    dark: 'editorError.foreground',
                    light: 'editorError.foreground',
                    hcDark: 'editorError.foreground',
                    hcLight: 'editorError.foreground'
                }, description: nls.localizeByDefault('The color used for the icon of error notifications. Notifications slide in from the bottom right of the window.')
            },
            {
                id: 'notificationsWarningIcon.foreground', defaults: {
                    dark: 'editorWarning.foreground',
                    light: 'editorWarning.foreground',
                    hcDark: 'editorWarning.foreground',
                    hcLight: 'editorWarning.foreground'
                }, description: nls.localizeByDefault('The color used for the icon of warning notifications. Notifications slide in from the bottom right of the window.')
            },
            {
                id: 'notificationsInfoIcon.foreground', defaults: {
                    dark: 'editorInfo.foreground',
                    light: 'editorInfo.foreground',
                    hcDark: 'editorInfo.foreground',
                    hcLight: 'editorInfo.foreground'
                }, description: nls.localizeByDefault('The color used for the icon of info notifications. Notifications slide in from the bottom right of the window.')
            }
        );
    }
}
