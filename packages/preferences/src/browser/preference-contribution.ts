/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject, postConstruct, named } from 'inversify';
import { MenuModelRegistry, CommandRegistry } from '@theia/core';
import {
    CommonMenus,
    AbstractViewContribution,
    CommonCommands,
    KeybindingRegistry,
    Widget,
    PreferenceScope,
    PreferenceProvider,
    PreferenceService,
    PreferenceItem
} from '@theia/core/lib/browser';
import { isFirefox } from '@theia/core/lib/browser';
import { isOSX } from '@theia/core/lib/common/os';
import { TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { PreferencesWidget } from './views/preference-widget';
import { PreferencesEventService } from './util/preference-event-service';
import { WorkspacePreferenceProvider } from './workspace-preference-provider';
import { USER_PREFERENCE_URI } from './user-preference-provider';
import { Preference, PreferencesCommands, PreferenceMenus } from './util/preference-types';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { FileService } from '@theia/filesystem/lib/browser/file-service';

@injectable()
export class PreferencesContribution extends AbstractViewContribution<PreferencesWidget> {

    @inject(PreferencesEventService) protected readonly preferencesEventService: PreferencesEventService;
    @inject(FileService) protected readonly fileService: FileService;
    @inject(PreferenceProvider) @named(PreferenceScope.Workspace) protected readonly workspacePreferenceProvider: WorkspacePreferenceProvider;
    @inject(EditorManager) protected readonly editorManager: EditorManager;
    @inject(PreferenceService) protected readonly preferenceValueRetrievalService: PreferenceService;
    @inject(ClipboardService) protected readonly clipboardService: ClipboardService;

    protected preferencesScope = Preference.DEFAULT_SCOPE;

    constructor() {
        super({
            widgetId: PreferencesWidget.ID,
            widgetName: PreferencesWidget.LABEL,
            defaultWidgetOptions: {
                area: 'main',
            },
        });
    }

    @postConstruct()
    init(): void {
        this.preferencesEventService.onTabScopeSelected.event(async e => {
            const widget: PreferencesWidget = await this.widget;
            this.preferencesScope = e;
            widget.preferenceScope = this.preferencesScope;
        });
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(CommonCommands.OPEN_PREFERENCES, {
            execute: () => this.openView({ reveal: true }),
        });
        commands.registerCommand(PreferencesCommands.OPEN_PREFERENCES_JSON_TOOLBAR, {
            isEnabled: () => true,
            isVisible: w => this.withWidget(w, () => true),
            execute: (preferenceNode: Preference.NodeWithValueInAllScopes) => {
                this.openPreferencesJSON(preferenceNode);
            }
        });
        commands.registerCommand(PreferencesCommands.COPY_JSON_NAME, {
            isEnabled: Preference.EditorCommandArgs.is,
            isVisible: Preference.EditorCommandArgs.is,
            execute: ({ id, value }: Preference.EditorCommandArgs) => {
                this.clipboardService.writeText(id);
            }
        });
        commands.registerCommand(PreferencesCommands.COPY_JSON_VALUE, {
            isEnabled: Preference.EditorCommandArgs.is,
            isVisible: Preference.EditorCommandArgs.is,
            execute: ({ id, value }: { id: string, value: string }) => {
                const jsonString = `"${id}": ${JSON.stringify(value)}`;
                this.clipboardService.writeText(jsonString);
            }
        });
        commands.registerCommand(PreferencesCommands.RESET_PREFERENCE, {
            isEnabled: Preference.EditorCommandArgs.is,
            isVisible: Preference.EditorCommandArgs.is,
            execute: ({ id, value }: Preference.EditorCommandArgs) => {
                this.preferenceValueRetrievalService.set(id, undefined, Number(this.preferencesScope.scope), this.preferencesScope.uri);
            }
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.FILE_SETTINGS_SUBMENU_OPEN, {
            commandId: CommonCommands.OPEN_PREFERENCES.id,
            label: CommonCommands.OPEN_PREFERENCES.label,
            order: 'a10',
        });
        menus.registerMenuAction(PreferenceMenus.PREFERENCE_EDITOR_CONTEXT_MENU, {
            commandId: PreferencesCommands.RESET_PREFERENCE.id,
            label: PreferencesCommands.RESET_PREFERENCE.label,
            order: 'a'
        });
        menus.registerMenuAction(PreferenceMenus.PREFERENCE_EDITOR_COPY_ACTIONS, {
            commandId: PreferencesCommands.COPY_JSON_VALUE.id,
            label: PreferencesCommands.COPY_JSON_VALUE.label,
            order: 'b'
        });
        menus.registerMenuAction(PreferenceMenus.PREFERENCE_EDITOR_COPY_ACTIONS, {
            commandId: PreferencesCommands.COPY_JSON_NAME.id,
            label: PreferencesCommands.COPY_JSON_NAME.label,
            order: 'c'
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        if (isOSX && !isFirefox) {
            keybindings.registerKeybinding({
                command: CommonCommands.OPEN_PREFERENCES.id,
                keybinding: 'cmd+,'
            });
        }

        keybindings.registerKeybinding({
            command: CommonCommands.OPEN_PREFERENCES.id,
            keybinding: 'ctrl+,',
        });
    }

    registerToolbarItems(toolbar: TabBarToolbarRegistry): void {
        toolbar.registerItem({
            id: PreferencesCommands.OPEN_PREFERENCES_JSON_TOOLBAR.id,
            command: PreferencesCommands.OPEN_PREFERENCES_JSON_TOOLBAR.id,
            tooltip: 'Open Preferences in JSON',
            priority: 0,
        });
    }

    protected async openPreferencesJSON(preferenceNode: Preference.NodeWithValueInAllScopes): Promise<void> {
        const wasOpenedFromEditor = preferenceNode.constructor !== PreferencesWidget;
        const { scope, activeScopeIsFolder, uri } = this.preferencesScope;
        const preferenceId = wasOpenedFromEditor ? preferenceNode.id : '';
        // when opening from toolbar, widget is passed as arg by default (we don't need this info)
        if (wasOpenedFromEditor) {
            const currentPreferenceValue = preferenceNode.preference.values!;
            const key = Preference.LookupKeys[Number(scope)] as keyof Preference.ValuesInAllScopes;
            const valueInCurrentScope = currentPreferenceValue[key] === undefined ? currentPreferenceValue.defaultValue : currentPreferenceValue[key] as PreferenceItem;
            this.preferenceValueRetrievalService.set(preferenceId, valueInCurrentScope, Number(scope), uri);
        }

        let jsonEditorWidget: EditorWidget;
        const jsonUriToOpen = await this.getPreferencesJSONUri(scope, activeScopeIsFolder, uri);
        if (jsonUriToOpen) {
            jsonEditorWidget = await this.editorManager.open(jsonUriToOpen);

            if (wasOpenedFromEditor) {
                const text = jsonEditorWidget.editor.document.getText();
                if (preferenceId) {
                    const { index } = text.match(preferenceId)!;
                    const numReturns = text.slice(0, index).match(new RegExp('\n', 'g'))!.length;
                    jsonEditorWidget.editor.cursor = { line: numReturns, character: 4 + preferenceId.length + 4 };
                }
            }
        }
    }

    private async getPreferencesJSONUri(scope: string, activeScopeIsFolder: string, uri: string): Promise<URI | undefined> {
        const scopeNumber = Number(scope);
        if (PreferenceScope.User === scopeNumber) {
            return USER_PREFERENCE_URI;
        } else if (PreferenceScope.Workspace === scopeNumber) {
            if (activeScopeIsFolder === 'true') {
                return this.getOrCreateSettingsFile(uri);
            } else {
                const configUri = this.workspacePreferenceProvider.getConfigUri();
                if (configUri) {
                    if (!await this.fileService.exists(configUri)) {
                        await this.fileService.create(configUri);
                    }
                    return configUri;
                }
            }

        } else if (PreferenceScope.Folder === scopeNumber) {
            return this.getOrCreateSettingsFile(uri);
        }
        return undefined;
    }

    protected async getOrCreateSettingsFile(folderURI: string): Promise<URI> {
        const folderSettingsURI = new URI(folderURI).resolve('.theia/settings.json');
        if (!await this.fileService.exists(folderSettingsURI)) {
            await this.fileService.create(folderSettingsURI);
        }
        return folderSettingsURI;
    }

    /**
     * Determine if the current widget is the PreferencesWidget.
     */
    protected withWidget<T>(widget: Widget | undefined = this.tryGetWidget(), fn: (widget: PreferencesWidget) => T): T | false {
        if (widget instanceof PreferencesWidget && widget.id === PreferencesWidget.ID) {
            return fn(widget);
        }
        return false;
    }
}
