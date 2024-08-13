// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import { nls } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';

export interface PreferenceLayout {
    id: string;
    label: string;
    children?: PreferenceLayout[];
    settings?: string[];
}

export const COMMONLY_USED_SECTION_PREFIX = 'commonly-used';

export const COMMONLY_USED_LAYOUT = {
    id: COMMONLY_USED_SECTION_PREFIX,
    label: nls.localizeByDefault('Commonly Used'),
    settings: [
        'files.autoSave',
        'editor.fontSize',
        'editor.fontFamily',
        'editor.tabSize',
        'editor.renderWhitespace',
        'editor.cursorStyle',
        'editor.multiCursorModifier',
        'editor.insertSpaces',
        'editor.wordWrap',
        'files.exclude',
        'files.associations'
    ]
};

export const DEFAULT_LAYOUT: PreferenceLayout[] = [
    {
        id: 'editor',
        label: nls.localizeByDefault('Text Editor'),
        settings: ['editor.*'],
        children: [
            {
                id: 'editor.cursor',
                label: nls.localizeByDefault('Cursor'),
                settings: ['editor.cursor*']
            },
            {
                id: 'editor.find',
                label: nls.localizeByDefault('Find'),
                settings: ['editor.find.*']
            },
            {
                id: 'editor.font',
                label: nls.localizeByDefault('Font'),
                settings: ['editor.font*']
            },
            {
                id: 'editor.format',
                label: nls.localizeByDefault('Formatting'),
                settings: ['editor.format*']
            },
            {
                id: 'editor.diffEditor',
                label: nls.localizeByDefault('Diff Editor'),
                settings: ['diffEditor.*']
            },
            {
                id: 'editor.multiDiffEditor',
                label: nls.localizeByDefault('Multi-File Diff Editor'),
                settings: ['multiDiffEditor.*']
            },
            {
                id: 'editor.minimap',
                label: nls.localizeByDefault('Minimap'),
                settings: ['editor.minimap.*']
            },
            {
                id: 'editor.suggestions',
                label: nls.localizeByDefault('Suggestions'),
                settings: ['editor.*suggest*']
            },
            {
                id: 'editor.files',
                label: nls.localizeByDefault('Files'),
                settings: ['files.*']
            }
        ]
    },
    {
        id: 'workbench',
        label: nls.localizeByDefault('Workbench'),
        settings: ['workbench.*', 'workspace.*'],
        children: [
            {
                id: 'workbench.appearance',
                label: nls.localizeByDefault('Appearance'),
                settings: [
                    'workbench.activityBar.*', 'workbench.*color*', 'workbench.fontAliasing', 'workbench.iconTheme', 'workbench.sidebar.location',
                    'workbench.*.visible', 'workbench.tips.enabled', 'workbench.tree.*', 'workbench.view.*'
                ]
            },
            {
                id: 'workbench.breadcrumbs',
                label: nls.localizeByDefault('Breadcrumbs'),
                settings: ['breadcrumbs.*']
            },
            {
                id: 'workbench.editor',
                label: nls.localizeByDefault('Editor Management'),
                settings: ['workbench.editor.*']
            },
            {
                id: 'workbench.settings',
                label: nls.localizeByDefault('Settings Editor'),
                settings: ['workbench.settings.*']
            },
            {
                id: 'workbench.zenmode',
                label: nls.localizeByDefault('Zen Mode'),
                settings: ['zenmode.*']
            },
            {
                id: 'workbench.screencastmode',
                label: nls.localizeByDefault('Screencast Mode'),
                settings: ['screencastMode.*']
            }
        ]
    },
    {
        id: 'window',
        label: nls.localizeByDefault('Window'),
        settings: ['window.*'],
        children: [
            {
                id: 'window.newWindow',
                label: nls.localizeByDefault('New Window'),
                settings: ['window.*newwindow*']
            }
        ]
    },
    {
        id: 'features',
        label: nls.localizeByDefault('Features'),
        children: [
            {
                id: 'features.accessibilitySignals',
                label: nls.localizeByDefault('Accessibility Signals'),
                settings: ['accessibility.signal*']
            },
            {
                id: 'features.accessibility',
                label: nls.localizeByDefault('Accessibility'),
                settings: ['accessibility.*']
            },
            {
                id: 'features.explorer',
                label: nls.localizeByDefault('Explorer'),
                settings: ['explorer.*', 'outline.*']
            },
            {
                id: 'features.search',
                label: nls.localizeByDefault('Search'),
                settings: ['search.*']
            },
            {
                id: 'features.debug',
                label: nls.localizeByDefault('Debug'),
                settings: ['debug.*', 'launch']
            },
            {
                id: 'features.testing',
                label: nls.localizeByDefault('Testing'),
                settings: ['testing.*']
            },
            {
                id: 'features.scm',
                label: nls.localizeByDefault('Source Control'),
                settings: ['scm.*']
            },
            {
                id: 'features.extensions',
                label: nls.localizeByDefault('Extensions'),
                settings: ['extensions.*']
            },
            {
                id: 'features.terminal',
                label: nls.localizeByDefault('Terminal'),
                settings: ['terminal.*']
            },
            {
                id: 'features.task',
                label: nls.localizeByDefault('Task'),
                settings: ['task.*']
            },
            {
                id: 'features.problems',
                label: nls.localizeByDefault('Problems'),
                settings: ['problems.*']
            },
            {
                id: 'features.output',
                label: nls.localizeByDefault('Output'),
                settings: ['output.*']
            },
            {
                id: 'features.comments',
                label: nls.localizeByDefault('Comments'),
                settings: ['comments.*']
            },
            {
                id: 'features.remote',
                label: nls.localizeByDefault('Remote'),
                settings: ['remote.*']
            },
            {
                id: 'features.timeline',
                label: nls.localizeByDefault('Timeline'),
                settings: ['timeline.*']
            },
            {
                id: 'features.toolbar',
                label: nls.localize('theia/preferences/toolbar', 'Toolbar'),
                settings: ['toolbar.*']
            },
            {
                id: 'features.notebook',
                label: nls.localizeByDefault('Notebook'),
                settings: ['notebook.*', 'interactiveWindow.*']
            },
            {
                id: 'features.mergeEditor',
                label: nls.localizeByDefault('Merge Editor'),
                settings: ['mergeEditor.*']
            },
            {
                id: 'features.chat',
                label: nls.localizeByDefault('Chat'),
                settings: ['chat.*', 'inlineChat.*']
            }
        ]
    },
    {
        id: 'application',
        label: nls.localizeByDefault('Application'),
        children: [
            {
                id: 'application.http',
                label: nls.localizeByDefault('HTTP'),
                settings: ['http.*']
            },
            {
                id: 'application.keyboard',
                label: nls.localizeByDefault('Keyboard'),
                settings: ['keyboard.*']
            },
            {
                id: 'application.update',
                label: nls.localizeByDefault('Update'),
                settings: ['update.*']
            },
            {
                id: 'application.telemetry',
                label: nls.localizeByDefault('Telemetry'),
                settings: ['telemetry.*']
            },
            {
                id: 'application.settingsSync',
                label: nls.localizeByDefault('Settings Sync'),
                settings: ['settingsSync.*']
            },
            {
                id: 'application.experimental',
                label: nls.localizeByDefault('Experimental'),
                settings: ['application.experimental.*']
            },
            {
                id: 'application.other',
                label: nls.localizeByDefault('Other'),
                settings: ['application.*']
            }
        ]
    },
    {
        id: 'security',
        label: nls.localizeByDefault('Security'),
        settings: ['security.*'],
        children: [
            {
                id: 'security.workspace',
                label: nls.localizeByDefault('Workspace'),
                settings: ['security.workspace.*']
            }
        ]
    },
    {
        id: 'ai-features',
        label: 'AI Features', // TODO localize
    },
    {
        id: 'extensions',
        label: nls.localizeByDefault('Extensions'),
        children: [
            {
                id: 'extensions.hosted-plugin',
                label: nls.localize('theia/preferences/hostedPlugin', 'Hosted Plugin'),
                settings: ['hosted-plugin.*']
            }
        ]
    }
];

@injectable()
export class PreferenceLayoutProvider {

    getLayout(): PreferenceLayout[] {
        return DEFAULT_LAYOUT;
    }

    getCommonlyUsedLayout(): PreferenceLayout {
        return COMMONLY_USED_LAYOUT;
    }

    hasCategory(id: string): boolean {
        return [...this.getLayout(), this.getCommonlyUsedLayout()].some(e => e.id === id);
    }

    getLayoutForPreference(preferenceId: string): PreferenceLayout | undefined {
        const layout = this.getLayout();
        for (const section of layout) {
            const item = this.findItemInSection(section, preferenceId);
            if (item) {
                return item;
            }
        }
        return undefined;
    }

    protected findItemInSection(section: PreferenceLayout, preferenceId: string): PreferenceLayout | undefined {
        // First check whether any of its children match the preferenceId.
        if (section.children) {
            for (const child of section.children) {
                const item = this.findItemInSection(child, preferenceId);
                if (item) {
                    return item;
                }
            }
        }
        // Then check whether the section itself matches the preferenceId.
        if (section.settings) {
            for (const setting of section.settings) {
                if (this.matchesSetting(preferenceId, setting)) {
                    return section;
                }
            }
        }
        return undefined;
    }

    protected matchesSetting(preferenceId: string, setting: string): boolean {
        if (setting.includes('*')) {
            return this.createRegExp(setting).test(preferenceId);
        }
        return preferenceId === setting;
    }

    protected createRegExp(setting: string): RegExp {
        return new RegExp(`^${setting.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`);
    }

}
