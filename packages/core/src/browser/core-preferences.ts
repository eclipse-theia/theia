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
import { environment } from '@theia/application-package/lib/environment';
import { createPreferenceProxy, PreferenceProxy, PreferenceService, PreferenceContribution, PreferenceSchema } from './preferences';
import { SUPPORTED_ENCODINGS } from './supported-encodings';
import { FrontendApplicationConfigProvider } from './frontend-application-config-provider';
import { isOSX } from '../common/os';
import { nls } from '../common/nls';
import { DefaultTheme } from '@theia/application-package/lib/application-props';

/* eslint-disable max-len */
const windowTitleDescription = [
    'Controls the window title based on the active editor. Variables are substituted based on the context:',
    '`${activeEditorShort}`: the file name (e.g. myFile.txt).',
    '`${activeEditorMedium}`: the path of the file relative to the workspace folder (e.g. myFolder/myFileFolder/myFile.txt).',
    '`${activeEditorLong}`: the full path of the file (e.g. /Users/Development/myFolder/myFileFolder/myFile.txt).',
    '`${activeFolderShort}`: the name of the folder the file is contained in (e.g. myFileFolder).',
    '`${activeFolderMedium}`: the path of the folder the file is contained in, relative to the workspace folder (e.g. myFolder/myFileFolder).',
    '`${activeFolderLong}`: the full path of the folder the file is contained in (e.g. /Users/Development/myFolder/myFileFolder).',
    '`${folderName}`: name of the workspace folder the file is contained in (e.g. myFolder).',
    '`${folderPath}`: file path of the workspace folder the file is contained in (e.g. /Users/Development/myFolder).',
    '`${rootName}`: name of the opened workspace or folder (e.g. myFolder or myWorkspace).',
    '`${rootPath}`: file path of the opened workspace or folder (e.g. /Users/Development/myWorkspace).',
    '`${appName}`: e.g. VS Code.',
    '`${remoteName}`: e.g. SSH',
    '`${dirty}`: an indicator for when the active editor has unsaved changes.',
    '`${separator}`: a conditional separator (" - ") that only shows when surrounded by variables with values or static text.'
].map(e => nls.localizeByDefault(e)).join('\n- ');

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
        'window.tabbar.enhancedPreview': {
            type: 'boolean',
            default: false,
            description: nls.localize('theia/core/enhancedPreview', 'Controls whether more information about the tab should be displayed in horizontal tab bars.')
        },
        'window.menuBarVisibility': {
            type: 'string',
            enum: ['classic', 'visible', 'hidden', 'compact'],
            markdownEnumDescriptions: [
                nls.localizeByDefault('Menu is displayed at the top of the window and only hidden in full screen mode.'),
                nls.localizeByDefault('Menu is always visible at the top of the window even in full screen mode.'),
                nls.localizeByDefault('Menu is always hidden.'),
                nls.localizeByDefault('Menu is displayed as a compact button in the side bar. This value is ignored when {0} is {1}.', '`#window.titleBarStyle#`', '`native`')
            ],
            default: 'classic',
            scope: 'application',
            markdownDescription: nls.localizeByDefault("Control the visibility of the menu bar. A setting of 'toggle' means that the menu bar is hidden and a single press of the Alt key will show it. A setting of 'compact' will move the menu into the side bar."),
            included: !(isOSX && environment.electron.is())
        },
        'window.title': {
            type: 'string',
            default: isOSX
                ? '${activeEditorShort}${separator}${rootName}'
                : '${dirty} ${activeEditorShort}${separator}${rootName}${separator}${appName}',
            scope: 'application',
            markdownDescription: windowTitleDescription
        },
        'window.titleSeparator': {
            type: 'string',
            default: ' - ',
            scope: 'application',
            markdownDescription: nls.localizeByDefault('Separator used by {0}.', '`#window.title#`')
        },
        'http.proxy': {
            type: 'string',
            pattern: '^https?://([^:]*(:[^@]*)?@)?([^:]+|\\[[:0-9a-fA-F]+\\])(:\\d+)?/?$|^$',
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
                nls.localizeByDefault('Enable proxy support for extensions, fall back to request options, when no proxy found.'),
                nls.localizeByDefault('Enable proxy support for extensions, override request options.'),
            ],
            default: 'override',
            description: nls.localizeByDefault('Use the proxy support for extensions.'),
            scope: 'application'
        },
        'http.systemCertificates': {
            type: 'boolean',
            default: true,
            description: nls.localizeByDefault('Controls whether CA certificates should be loaded from the OS. (On Windows and macOS, a reload of the window is required after turning this off.)'),
            scope: 'application'
        },
        'workbench.list.openMode': {
            type: 'string',
            enum: [
                'singleClick',
                'doubleClick'
            ],
            default: 'singleClick',
            description: nls.localizeByDefault('Controls how to open items in trees and lists using the mouse (if supported). Note that some trees and lists might choose to ignore this setting if it is not applicable.')
        },
        'workbench.editor.highlightModifiedTabs': {
            'type': 'boolean',
            'markdownDescription': nls.localize('theia/core/highlightModifiedTabs', 'Controls whether a top border is drawn on modified (dirty) editor tabs or not.'),
            'default': false
        },
        'workbench.editor.closeOnFileDelete': {
            'type': 'boolean',
            'description': nls.localizeByDefault('Controls whether editors showing a file that was opened during the session should close automatically when getting deleted or renamed by some other process. Disabling this will keep the editor open  on such an event. Note that deleting from within the application will always close the editor and that editors with unsaved changes will never close to preserve your data.'),
            'default': false
        },
        'workbench.editor.mouseBackForwardToNavigate': {
            'type': 'boolean',
            'description': nls.localizeByDefault("Enables the use of mouse buttons four and five for commands 'Go Back' and 'Go Forward'."),
            'default': true
        },
        'workbench.editor.revealIfOpen': {
            'type': 'boolean',
            'description': nls.localizeByDefault('Controls whether an editor is revealed in any of the visible groups if opened. If disabled, an editor will prefer to open in the currently active editor group. If enabled, an already opened editor will be revealed instead of opened again in the currently active editor group. Note that there are some cases where this setting is ignored, such as when forcing an editor to open in a specific group or to the side of the currently active group.'),
            'default': false
        },
        'workbench.commandPalette.history': {
            type: 'number',
            default: 50,
            minimum: 0,
            description: nls.localizeByDefault('Controls the number of recently used commands to keep in history for the command palette. Set to 0 to disable command history.')
        },
        'workbench.colorTheme': {
            type: 'string',
            enum: ['dark', 'light', 'hc-theia'],
            enumItemLabels: ['Dark (Theia)', 'Light (Theia)', 'High Contrast (Theia)'],
            default: DefaultTheme.defaultForOSTheme(FrontendApplicationConfigProvider.get().defaultTheme),
            description: nls.localizeByDefault('Specifies the color theme used in the workbench.')
        },
        'workbench.iconTheme': {
            type: ['string'],
            enum: ['none', 'theia-file-icons'],
            enumItemLabels: [nls.localizeByDefault('None'), 'File Icons (Theia)'],
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
            description: nls.localizeByDefault('Controls the hover feedback delay in milliseconds of the dragging area in between views/editors.')
        },
        'workbench.sash.size': {
            type: 'number',
            default: 4,
            minimum: 1,
            maximum: 20,
            description: nls.localizeByDefault('Controls the feedback area size in pixels of the dragging area in between views/editors. Set it to a larger value if you feel it\'s hard to resize views using the mouse.')
        },
        'workbench.tab.maximize': {
            type: 'boolean',
            default: false,
            description: nls.localize('theia/core/tabMaximize', 'Controls whether to maximize tabs on double click.')
        },
        'workbench.tab.shrinkToFit.enabled': {
            type: 'boolean',
            default: false,
            description: nls.localize('theia/core/tabShrinkToFit', 'Shrink tabs to fit available space.')
        },
        'workbench.tab.shrinkToFit.minimumSize': {
            type: 'number',
            default: 50,
            minimum: 10,
            description: nls.localize('theia/core/tabMinimumSize', 'Specifies the minimum size for tabs.')
        },
        'workbench.tab.shrinkToFit.defaultSize': {
            type: 'number',
            default: 200,
            minimum: 10,
            description: nls.localize('theia/core/tabDefaultSize', 'Specifies the default size for tabs.')
        }
    }
};

export interface CoreConfiguration {
    'application.confirmExit': 'never' | 'ifRequired' | 'always';
    'breadcrumbs.enabled': boolean;
    'files.encoding': string;
    'keyboard.dispatch': 'code' | 'keyCode';
    'window.tabbar.enhancedPreview': boolean;
    'window.menuBarVisibility': 'classic' | 'visible' | 'hidden' | 'compact';
    'window.title': string;
    'window.titleSeparator': string;
    'workbench.list.openMode': 'singleClick' | 'doubleClick';
    'workbench.commandPalette.history': number;
    'workbench.editor.highlightModifiedTabs': boolean;
    'workbench.editor.mouseBackForwardToNavigate': boolean;
    'workbench.editor.closeOnFileDelete': boolean;
    'workbench.editor.revealIfOpen': boolean;
    'workbench.colorTheme': string;
    'workbench.iconTheme': string;
    'workbench.silentNotifications': boolean;
    'workbench.statusBar.visible': boolean;
    'workbench.tree.renderIndentGuides': 'onHover' | 'none' | 'always';
    'workbench.hover.delay': number;
    'workbench.sash.hoverDelay': number;
    'workbench.sash.size': number;
    'workbench.tab.maximize': boolean;
    'workbench.tab.shrinkToFit.enabled': boolean;
    'workbench.tab.shrinkToFit.minimumSize': number;
    'workbench.tab.shrinkToFit.defaultSize': number;
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
