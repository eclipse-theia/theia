// *****************************************************************************
// Copyright (C) 2025 1C-Soft LLC and others.
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
import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry, nls } from '@theia/core';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import {
    ApplicationShell,
    codicon,
    ConfirmDialog,
    FrontendApplicationContribution,
    KeybindingContribution,
    KeybindingRegistry,
    LabelProvider
} from '@theia/core/lib/browser';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { ColorRegistry } from '@theia/core/lib/browser/color-registry';
import { Color } from '@theia/core/lib/common/color';
import { ScmColors } from '../scm-colors';
import { MergeEditor, MergeEditorSettings } from './merge-editor';

export namespace MergeEditorCommands {
    export const MERGE_EDITOR_CATEGORY = 'Merge Editor';
    export const ACCEPT_MERGE = Command.toDefaultLocalizedCommand({
        id: 'mergeEditor.acceptMerge', // don't change: this is an API command
        label: 'Complete Merge',
        category: MERGE_EDITOR_CATEGORY
    });
    export const GO_TO_NEXT_UNHANDLED_CONFLICT = Command.toDefaultLocalizedCommand({
        id: 'mergeEditor.goToNextUnhandledConflict',
        label: 'Go to Next Unhandled Conflict',
        category: MERGE_EDITOR_CATEGORY
    });
    export const GO_TO_PREVIOUS_UNHANDLED_CONFLICT = Command.toDefaultLocalizedCommand({
        id: 'mergeEditor.goToPreviousUnhandledConflict',
        label: 'Go to Previous Unhandled Conflict',
        category: MERGE_EDITOR_CATEGORY
    });
    export const SET_MIXED_LAYOUT = Command.toDefaultLocalizedCommand({
        id: 'mergeEditor.setMixedLayout',
        label: 'Mixed Layout',
        category: MERGE_EDITOR_CATEGORY
    });
    export const SET_COLUMN_LAYOUT = Command.toDefaultLocalizedCommand({
        id: 'mergeEditor.setColumnLayout',
        label: 'Column Layout',
        category: MERGE_EDITOR_CATEGORY
    });
    export const SHOW_BASE = Command.toDefaultLocalizedCommand({
        id: 'mergeEditor.showBase',
        label: 'Show Base',
        category: MERGE_EDITOR_CATEGORY
    });
    export const SHOW_BASE_TOP = Command.toDefaultLocalizedCommand({
        id: 'mergeEditor.showBaseTop',
        label: 'Show Base Top',
        category: MERGE_EDITOR_CATEGORY
    });
    export const SHOW_BASE_CENTER = Command.toDefaultLocalizedCommand({
        id: 'mergeEditor.showBaseCenter',
        label: 'Show Base Center',
        category: MERGE_EDITOR_CATEGORY
    });
}

@injectable()
export class MergeEditorContribution implements FrontendApplicationContribution,
    CommandContribution, MenuContribution, TabBarToolbarContribution, KeybindingContribution, ColorContribution {

    @inject(MergeEditorSettings)
    protected readonly settings: MergeEditorSettings;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    onStart(): void {
        this.settings.load();
    }

    onStop(): void {
        this.settings.save();
    }

    protected getMergeEditor(widget = this.shell.currentWidget): MergeEditor | undefined {
        return widget instanceof MergeEditor ? widget : (widget?.parent ? this.getMergeEditor(widget.parent) : undefined);
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(MergeEditorCommands.ACCEPT_MERGE, {
            execute: async widget => {
                const editor = this.getMergeEditor(widget);
                if (editor) {
                    let canceled = false;
                    if (editor.model.unhandledMergeRangesCount > 0) {
                        canceled = !(await new ConfirmDialog({
                            title: nls.localizeByDefault('Do you want to complete the merge of {0}?', this.labelProvider.getName(editor.resultUri)),
                            msg: nls.localizeByDefault('The file contains unhandled conflicts.'),
                            ok: nls.localizeByDefault('Complete with Conflicts')
                        }).open());
                    }
                    if (!canceled) {
                        await editor.model.resultDocument.save();
                        editor.close();
                        return {
                            successful: true
                        };
                    }
                }
                return {
                    successful: false
                };
            },
            isEnabled: widget => !!this.getMergeEditor(widget),
            isVisible: widget => !!this.getMergeEditor(widget)
        });
        commands.registerCommand(MergeEditorCommands.GO_TO_NEXT_UNHANDLED_CONFLICT, {
            execute: widget => {
                const editor = this.getMergeEditor(widget);
                if (editor) {
                    editor.goToNextMergeRange(mergeRange => !editor.model.isMergeRangeHandled(mergeRange));
                    editor.activate();
                }
            },
            isEnabled: widget => !!this.getMergeEditor(widget),
            isVisible: widget => !!this.getMergeEditor(widget)
        });
        commands.registerCommand(MergeEditorCommands.GO_TO_PREVIOUS_UNHANDLED_CONFLICT, {
            execute: widget => {
                const editor = this.getMergeEditor(widget);
                if (editor) {
                    editor.goToPreviousMergeRange(mergeRange => !editor.model.isMergeRangeHandled(mergeRange));
                    editor.activate();
                }
            },
            isEnabled: widget => !!this.getMergeEditor(widget),
            isVisible: widget => !!this.getMergeEditor(widget)
        });
        commands.registerCommand(MergeEditorCommands.SET_MIXED_LAYOUT, {
            execute: widget => {
                const editor = this.getMergeEditor(widget);
                if (editor) {
                    editor.layoutKind = 'mixed';
                    editor.activate();
                }
            },
            isEnabled: widget => !!this.getMergeEditor(widget),
            isVisible: widget => !!this.getMergeEditor(widget),
            isToggled: widget => this.getMergeEditor(widget)?.layoutKind === 'mixed',
        });
        commands.registerCommand(MergeEditorCommands.SET_COLUMN_LAYOUT, {
            execute: widget => {
                const editor = this.getMergeEditor(widget);
                if (editor) {
                    editor.layoutKind = 'columns';
                    editor.activate();
                }
            },
            isEnabled: widget => !!this.getMergeEditor(widget),
            isVisible: widget => !!this.getMergeEditor(widget),
            isToggled: widget => this.getMergeEditor(widget)?.layoutKind === 'columns'
        });
        commands.registerCommand(MergeEditorCommands.SHOW_BASE, {
            execute: widget => {
                const editor = this.getMergeEditor(widget);
                if (editor) {
                    editor.toggleShowBase();
                    editor.activate();
                }
            },
            isEnabled: widget => this.getMergeEditor(widget)?.layoutKind === 'columns',
            isVisible: widget => this.getMergeEditor(widget)?.layoutKind === 'columns',
            isToggled: widget => !!this.getMergeEditor(widget)?.isShowingBase
        });
        commands.registerCommand(MergeEditorCommands.SHOW_BASE_TOP, {
            execute: widget => {
                const editor = this.getMergeEditor(widget);
                if (editor) {
                    editor.toggleShowBaseTop();
                    editor.activate();
                }
            },
            isEnabled: widget => this.getMergeEditor(widget)?.layoutKind === 'mixed',
            isVisible: widget => this.getMergeEditor(widget)?.layoutKind === 'mixed',
            isToggled: widget => !!this.getMergeEditor(widget)?.isShowingBaseAtTop
        });
        commands.registerCommand(MergeEditorCommands.SHOW_BASE_CENTER, {
            execute: widget => {
                const editor = this.getMergeEditor(widget);
                if (editor) {
                    editor.toggleShowBaseCenter();
                    editor.activate();
                }
            },
            isEnabled: widget => this.getMergeEditor(widget)?.layoutKind === 'mixed',
            isVisible: widget => this.getMergeEditor(widget)?.layoutKind === 'mixed',
            isToggled: widget => {
                const editor = this.getMergeEditor(widget);
                return !!(editor?.isShowingBase && !editor.isShowingBaseAtTop);
            }
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem({
            id: MergeEditorCommands.GO_TO_NEXT_UNHANDLED_CONFLICT.id,
            command: MergeEditorCommands.GO_TO_NEXT_UNHANDLED_CONFLICT.id,
            icon: codicon('arrow-down', true),
            group: 'navigation',
            order: 'a'
        });
        registry.registerItem({
            id: MergeEditorCommands.GO_TO_PREVIOUS_UNHANDLED_CONFLICT.id,
            command: MergeEditorCommands.GO_TO_PREVIOUS_UNHANDLED_CONFLICT.id,
            icon: codicon('arrow-up', true),
            group: 'navigation',
            order: 'b'
        });
        registry.registerItem({
            id: MergeEditorCommands.SET_MIXED_LAYOUT.id,
            command: MergeEditorCommands.SET_MIXED_LAYOUT.id,
            group: '1_merge',
            order: 'a'
        });
        registry.registerItem({
            id: MergeEditorCommands.SET_COLUMN_LAYOUT.id,
            command: MergeEditorCommands.SET_COLUMN_LAYOUT.id,
            group: '1_merge',
            order: 'b'
        });
        registry.registerItem({
            id: MergeEditorCommands.SHOW_BASE.id,
            command: MergeEditorCommands.SHOW_BASE.id,
            group: '2_merge',
            order: 'a'
        });
        registry.registerItem({
            id: MergeEditorCommands.SHOW_BASE_TOP.id,
            command: MergeEditorCommands.SHOW_BASE_TOP.id,
            group: '2_merge',
            order: 'b'
        });
        registry.registerItem({
            id: MergeEditorCommands.SHOW_BASE_CENTER.id,
            command: MergeEditorCommands.SHOW_BASE_CENTER.id,
            group: '2_merge',
            order: 'c'
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
    }

    /**
     * It should be aligned with https://code.visualstudio.com/api/references/theme-color#merge-conflicts-colors
     */
    registerColors(colors: ColorRegistry): void {
        colors.register({
            id: 'mergeEditor.change.background',
            description: 'The background color for changes.',
            defaults: { dark: '#9bb95533', light: '#9bb95533', hcDark: '#9bb95533', hcLight: '#9bb95533' }
        }, {
            id: 'mergeEditor.change.word.background',
            description: 'The background color for word changes.',
            defaults: { dark: '#9ccc2c33', light: '#9ccc2c66', hcDark: '#9ccc2c33', hcLight: '#9ccc2c66' }
        }, {
            id: 'mergeEditor.changeBase.background',
            description: 'The background color for changes in base.',
            defaults: { dark: '#4B1818FF', light: '#FFCCCCFF', hcDark: '#4B1818FF', hcLight: '#FFCCCCFF' }
        }, {
            id: 'mergeEditor.changeBase.word.background',
            description: 'The background color for word changes in base.',
            defaults: { dark: '#6F1313FF', light: '#FFA3A3FF', hcDark: '#6F1313FF', hcLight: '#FFA3A3FF' }
        }, {
            id: 'mergeEditor.conflict.unhandledUnfocused.border',
            description: 'The border color of unhandled unfocused conflicts.',
            defaults: { dark: '#ffa6007a', light: '#ffa600FF', hcDark: '#ffa6007a', hcLight: '#ffa6007a' }
        }, {
            id: 'mergeEditor.conflict.unhandledUnfocused.background',
            description: 'The background color of unhandled unfocused conflicts.',
            defaults: {
                dark: Color.transparent('mergeEditor.conflict.unhandledUnfocused.border', 0.05),
                light: Color.transparent('mergeEditor.conflict.unhandledUnfocused.border', 0.05)
            }
        }, {
            id: 'mergeEditor.conflict.unhandledFocused.border',
            description: 'The border color of unhandled focused conflicts.',
            defaults: { dark: '#ffa600', light: '#ffa600', hcDark: '#ffa600', hcLight: '#ffa600' }
        }, {
            id: 'mergeEditor.conflict.unhandledFocused.background',
            description: 'The background color of unhandled focused conflicts.',
            defaults: {
                dark: Color.transparent('mergeEditor.conflict.unhandledFocused.border', 0.05),
                light: Color.transparent('mergeEditor.conflict.unhandledFocused.border', 0.05)
            }
        }, {
            id: 'mergeEditor.conflict.handledUnfocused.border',
            description: 'The border color of handled unfocused conflicts.',
            defaults: { dark: '#86868649', light: '#86868649', hcDark: '#86868649', hcLight: '#86868649' }
        }, {
            id: 'mergeEditor.conflict.handledUnfocused.background',
            description: 'The background color of handled unfocused conflicts.',
            defaults: {
                dark: Color.transparent('mergeEditor.conflict.handledUnfocused.border', 0.1),
                light: Color.transparent('mergeEditor.conflict.handledUnfocused.border', 0.1)
            }
        }, {
            id: 'mergeEditor.conflict.handledFocused.border',
            description: 'The border color of handled focused conflicts.',
            defaults: { dark: '#c1c1c1cc', light: '#c1c1c1cc', hcDark: '#c1c1c1cc', hcLight: '#c1c1c1cc' }
        }, {
            id: 'mergeEditor.conflict.handledFocused.background',
            description: 'The background color of handled focused conflicts.',
            defaults: {
                dark: Color.transparent('mergeEditor.conflict.handledFocused.border', 0.1),
                light: Color.transparent('mergeEditor.conflict.handledFocused.border', 0.1)
            }
        }, {
            id: ScmColors.handledConflictMinimapOverviewRulerColor,
            description: 'Minimap gutter and overview ruler marker color for handled conflicts.',
            defaults: { dark: '#adaca8ee', light: '#adaca8ee', hcDark: '#adaca8ee', hcLight: '#adaca8ee' }
        }, {
            id: ScmColors.unhandledConflictMinimapOverviewRulerColor,
            description: 'Minimap gutter and overview ruler marker color for unhandled conflicts.',
            defaults: { dark: '#fcba03FF', light: '#fcba03FF', hcDark: '#fcba03FF', hcLight: '#fcba03FF' }
        });
    }
}
