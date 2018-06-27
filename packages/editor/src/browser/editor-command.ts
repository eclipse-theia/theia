/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import {inject, injectable} from "inversify";
import {CommandContribution, CommandRegistry, Command} from "@theia/core/lib/common";
import {CommonCommands, PreferenceService} from "@theia/core/lib/browser";

export namespace EditorCommands {

    /**
     * Show editor references
     */
    export const SHOW_REFERENCES: Command = {
        id: 'textEditor.commands.showReferences'
    };
    /**
     * Change indentation configuration (i.e., indent using tabs / spaces, and how many spaces per tab)
     */
    export const CONFIG_INDENTATION: Command = {
        id: 'textEditor.commands.configIndentation'
    };
    export const INDENT_USING_SPACES: Command = {
        id: 'textEditor.commands.indentUsingSpaces',
        label: 'Indent Using Spaces'
    };
    export const INDENT_USING_TABS: Command = {
        id: 'textEditor.commands.indentUsingTabs',
        label: 'Indent Using Tabs'
    };

    /**
     * Command for going back to the last editor navigation location.
     */
    export const GO_BACK: Command = {
        id: 'textEditor.commands.go.back',
        label: 'Go Back'
    };
    /**
     * Command for going to the forthcoming editor navigation location.
     */
    export const GO_FORWARD: Command = {
        id: 'textEditor.commands.go.forward',
        label: 'Go Forward'
    };
    /**
     * Command that reveals the last text edit location, if any.
     */
    export const GO_LAST_EDIT: Command = {
        id: 'textEditor.commands.go.lastEdit',
        label: 'Go to Last Edit Location'
    };
}

@injectable()
export class EditorCommandContribution implements CommandContribution {

    public static readonly AUTOSAVE_PREFERENCE: string = "editor.autoSave";

    @inject(PreferenceService)
    protected readonly preferencesService: PreferenceService;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(EditorCommands.SHOW_REFERENCES);
        registry.registerCommand(EditorCommands.CONFIG_INDENTATION);
        registry.registerCommand(EditorCommands.INDENT_USING_SPACES);
        registry.registerCommand(EditorCommands.INDENT_USING_TABS);

        registry.registerCommand(EditorCommands.GO_BACK);
        registry.registerCommand(EditorCommands.GO_FORWARD);
        registry.registerCommand(EditorCommands.GO_LAST_EDIT);

        registry.registerCommand(CommonCommands.AUTO_SAVE, {
            isToggled: () => this.isAutoSaveOn(),
            execute: () => this.toggleAutoSave()
        });
    }

    private isAutoSaveOn(): boolean {
        const autoSave = this.preferencesService.get(EditorCommandContribution.AUTOSAVE_PREFERENCE);
        return autoSave === 'on' || autoSave === undefined;
    }

    private async toggleAutoSave(): Promise<void> {
        this.preferencesService.set(EditorCommandContribution.AUTOSAVE_PREFERENCE, this.isAutoSaveOn() ? 'off' : 'on');
    }
}
