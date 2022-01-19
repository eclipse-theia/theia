// *****************************************************************************
// Copyright (C) 2018 Google and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { interfaces } from 'inversify';
import { createPreferenceProxy, PreferenceProxy, PreferenceService, PreferenceContribution, PreferenceSchema } from './preferences';
import { SUPPORTED_ENCODINGS } from './supported-encodings';
import { FrontendApplicationConfigProvider } from './frontend-application-config-provider';
import { isOSX } from '../common/os';
import { nls } from '../common/nls';

export const corePreferenceSchema: PreferenceSchema = {
    'type': 'object',
    properties: {
        'application.confirmExit': {
            type: 'string',
            enum: [
                'never',
                'ifRequired',
                'always',
            ],
            default: 'ifRequired',
            // eslint-disable-next-line max-len
            description: nls.localizeByDefault('Controls whether to show a confirmation dialog before closing the browser tab or window. Note that even if enabled, browsers may still decide to close a tab or window without confirmation and that this setting is only a hint that may not work in all cases.'),
        },
        'breadcrumbs.enabled': {
            'type': 'boolean',
            'default': true,
            'description': nls.localizeByDefault('Enable/disable navigation breadcrumbs.'),
            'scope': 'application'
        },
        'files.encoding': {
            'type': 'string',
            'enum': Object.keys(SUPPORTED_ENCODINGS),
            'default': 'utf8',
            'description': nls.localizeByDefault(
                'The default character set encoding to use when reading and writing files. This setting can also be configured per language.'),
            'scope': 'language-overridable',
            'enumDescriptions': Object.keys(SUPPORTED_ENCODINGS).map(key => SUPPORTED_ENCODINGS[key].labelLong),
            'included': Object.keys(SUPPORTED_ENCODINGS).length > 1
        },
        'keyboard.dispatch': {
            type: 'string',
            enum: [
                'code',
                'keyCode',
            ],
            default: 'code',
            markdownDescription: nls.localizeByDefault('Controls the dispatching logic for key presses to use either `code` (recommended) or `keyCode`.')
        },
        'window.menuBarVisibility': {
            type: 'string',
            enum: ['classic', 'visible', 'hidden', 'compact'],
            markdownEnumDescriptions: [
                nls.localizeByDefault('Menu is only hidden in full screen mode.'),
                nls.localizeByDefault('Menu is always visible even in full screen mode.'),
                nls.localizeByDefault('Menu is always hidden.'),
                nls.localizeByDefault('Menu is displayed as a compact button in the sidebar. This value is ignored when `#window.titleBarStyle#` is `native`.')
            ],
            default: 'classic',
            scope: 'application',
            // eslint-disable-next-line max-len
            markdownDescription: nls.localizeByDefault("Control the visibility of the menu bar. A setting of 'toggle' means that the menu bar is hidden and a single press of the Alt key will show it. By default, the menu bar will be visible, unless the window is full screen."),
            included: !isOSX
        },
        'http.proxy': {
            type: 'string',
            pattern: '^https?://([^:]*(:[^@]*)?@)?([^:]+|\\[[:0-9a-fA-F]+\\])(:\\d+)?/?$|^$',
            // eslint-disable-next-line max-len
            markdownDescription: nls.localizeByDefault('The proxy setting to use. If not set, will be inherited from the `http_proxy` and `https_proxy` environment variables.'),
            scope: 'application'
        },
        'http.proxyStrictSSL': {
            type: 'boolean',
            default: true,
            description: nls.localizeByDefault('Controls whether the proxy server certificate should be verified against the list of supplied CAs.'),
            scope: 'application'
        },
        'http.proxyAuthorization': {
            type: 'string',
            markdownDescription: nls.localizeByDefault('The value to send as the `Proxy-Authorization` header for every network request.'),
            scope: 'application'
        },
        'http.proxySupport': {
            type: 'string',
            enum: ['off', 'on', 'fallback', 'override'],
            enumDescriptions: [
                nls.localizeByDefault('Disable proxy support for extensions.'),
                nls.localizeByDefault('Enable proxy support for extensions.'),
                nls.localize('theia/core/proxySupportFallback', 'Enable proxy support for extensions, fall back to request options, when no proxy found.'),
                nls.localizeByDefault('Enable proxy support for extensions, override request options.'),
            ],
            default: 'override',
            description: nls.localizeByDefault('Use the proxy support for extensions.'),
            scope: 'application'
        },
        'http.systemCertificates': {
            type: 'boolean',
            default: true,
            // eslint-disable-next-line max-len
            description: nls.localizeByDefault('Controls whether CA certificates should be loaded from the OS. (On Windows and macOS a reload of the window is required after turning this off.)'),
            scope: 'application'
        },
        'workbench.list.openMode': {
            type: 'string',
            enum: [
                'singleClick',
                'doubleClick'
            ],
            default: 'singleClick',
            // eslint-disable-next-line max-len
            description: nls.localizeByDefault('Controls how to open items in trees and lists using the mouse (if supported). For parents with children in trees, this setting will control if a single click expands the parent or a double click. Note that some trees and lists might choose to ignore this setting if it is not applicable. ')
        },
        'workbench.editor.highlightModifiedTabs': {
            'type': 'boolean',
            // eslint-disable-next-line max-len
            'markdownDescription': nls.localize('theia/core/highlightModifiedTabs', 'Controls whether a top border is drawn on modified (dirty) editor tabs or not.'),
            'default': false
        },
        'workbench.editor.closeOnFileDelete': {
            'type': 'boolean',
            // eslint-disable-next-line max-len
            'description': nls.localizeByDefault('Controls whether editors showing a file that was opened during the session should close automatically when getting deleted or renamed by some other process. Disabling this will keep the editor open  on such an event. Note that deleting from within the application will always close the editor and that dirty files will never close to preserve your data.'),
            'default': false
        },
        'workbench.commandPalette.history': {
            type: 'number',
            default: 50,
            minimum: 0,
            // eslint-disable-next-line max-len
            description: nls.localizeByDefault('Controls the number of recently used commands to keep in history for the command palette. Set to 0 to disable command history.')
        },
        'workbench.colorTheme': {
            type: 'string',
            default: FrontendApplicationConfigProvider.get().defaultTheme,
            description: nls.localizeByDefault('Specifies the color theme used in the workbench.')
        },
        'workbench.iconTheme': {
            type: ['string', 'null'],
            default: FrontendApplicationConfigProvider.get().defaultIconTheme,
            description: nls.localizeByDefault("Specifies the file icon theme used in the workbench or 'null' to not show any file icons.")
        },
        'workbench.silentNotifications': {
            type: 'boolean',
            default: false,
            description: nls.localize('theia/core/silentNotifications', 'Controls whether to suppress notification popups.')
        },
        'workbench.statusBar.visible': {
            type: 'boolean',
            default: true,
            description: nls.localizeByDefault('Controls the visibility of the status bar at the bottom of the workbench.')
        },
        'workbench.tree.renderIndentGuides': {
            type: 'string',
            enum: ['onHover', 'none', 'always'],
            default: 'onHover',
            description: nls.localizeByDefault('Controls whether the tree should render indent guides.')
        },
        'workbench.hover.delay': {
            type: 'number',
            default: isOSX ? 1500 : 500,
            description: nls.localizeByDefault('Controls the delay in milliseconds after which the hover is shown.')
        },
        'workbench.sash.hoverDelay': {
            type: 'number',
            default: 300,
            minimum: 0,
            maximum: 2000,
            // nls-todo: Will be available with VSCode API 1.55
            description: nls.localize('theia/core/sashDelay', 'Controls the hover feedback delay in milliseconds of the dragging area in between views/editors.')
        },
        'workbench.sash.size': {
            type: 'number',
            default: 4,
            minimum: 1,
            maximum: 20,
            // nls-todo: Will be available with VSCode API 1.55
            description: nls.localize(
                'theia/core/sashSize',
                'Controls the feedback area size in pixels of the dragging area in between views/editors. Set it to a larger value if needed.'
            )
        },
    }
};

export interface CoreConfiguration {
    'application.confirmExit': 'never' | 'ifRequired' | 'always';
    'breadcrumbs.enabled': boolean;
    'files.encoding': string
    'keyboard.dispatch': 'code' | 'keyCode';
    'window.menuBarVisibility': 'classic' | 'visible' | 'hidden' | 'compact';
    'workbench.list.openMode': 'singleClick' | 'doubleClick';
    'workbench.commandPalette.history': number;
    'workbench.editor.highlightModifiedTabs': boolean;
    'workbench.editor.closeOnFileDelete': boolean;
    'workbench.colorTheme': string;
    'workbench.iconTheme': string | null;
    'workbench.silentNotifications': boolean;
    'workbench.statusBar.visible': boolean;
    'workbench.tree.renderIndentGuides': 'onHover' | 'none' | 'always';
    'workbench.hover.delay': number;
    'workbench.sash.hoverDelay': number;
    'workbench.sash.size': number;
}

export const CorePreferenceContribution = Symbol('CorePreferenceContribution');
export const CorePreferences = Symbol('CorePreferences');
export type CorePreferences = PreferenceProxy<CoreConfiguration>;

export function createCorePreferences(preferences: PreferenceService, schema: PreferenceSchema = corePreferenceSchema): CorePreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindCorePreferences(bind: interfaces.Bind): void {
    bind(CorePreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(CorePreferenceContribution);
        return createCorePreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(CorePreferenceContribution).toConstantValue({ schema: corePreferenceSchema });
    bind(PreferenceContribution).toService(CorePreferenceContribution);
}
