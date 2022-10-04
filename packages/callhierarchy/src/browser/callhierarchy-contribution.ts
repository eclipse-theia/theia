// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { MenuModelRegistry, Command, CommandRegistry } from '@theia/core/lib/common';
import { AbstractViewContribution, OpenViewArguments, KeybindingRegistry } from '@theia/core/lib/browser';
import { EDITOR_CONTEXT_MENU, CurrentEditorAccess, EditorManager } from '@theia/editor/lib/browser';
import { CallHierarchyTreeWidget } from './callhierarchy-tree/callhierarchy-tree-widget';
import { CALLHIERARCHY_ID, CALL_HIERARCHY_LABEL, CALL_HIERARCHY_TOGGLE_COMMAND_ID } from './callhierarchy';
import { CallHierarchyServiceProvider } from './callhierarchy-service';
import URI from '@theia/core/lib/common/uri';
import { ContextKey, ContextKeyService } from '@theia/core/lib/browser/context-key-service';
export { CALL_HIERARCHY_LABEL, CALL_HIERARCHY_TOGGLE_COMMAND_ID };

export namespace CallHierarchyCommands {
    export const OPEN = Command.toLocalizedCommand({
        id: 'callhierarchy:open',
        label: 'Open Call Hierarchy'
    }, 'theia/callhierarchy/open');
}

@injectable()
export class CallHierarchyContribution extends AbstractViewContribution<CallHierarchyTreeWidget> {

    @inject(CurrentEditorAccess) protected readonly editorAccess: CurrentEditorAccess;
    @inject(EditorManager) protected readonly editorManager: EditorManager;
    @inject(CallHierarchyServiceProvider) protected readonly callHierarchyServiceProvider: CallHierarchyServiceProvider;
    @inject(ContextKeyService) protected readonly contextKeyService: ContextKeyService;

    protected editorHasCallHierarchyProvider!: ContextKey<boolean>;

    constructor() {
        super({
            widgetId: CALLHIERARCHY_ID,
            widgetName: CALL_HIERARCHY_LABEL,
            defaultWidgetOptions: {
                area: 'bottom'
            },
            toggleCommandId: CALL_HIERARCHY_TOGGLE_COMMAND_ID,
            toggleKeybinding: 'ctrlcmd+shift+f1'
        });
    }

    @postConstruct()
    protected init(): void {
        this.editorHasCallHierarchyProvider = this.contextKeyService.createKey('editorHasCallHierarchyProvider', false);
        this.editorManager.onCurrentEditorChanged(() => this.editorHasCallHierarchyProvider.set(this.isCallHierarchyAvailable()));
        this.callHierarchyServiceProvider.onDidChange(() => this.editorHasCallHierarchyProvider.set(this.isCallHierarchyAvailable()));
    }

    protected isCallHierarchyAvailable(): boolean {
        const { selection, languageId } = this.editorAccess;
        return !!selection && !!languageId && !!this.callHierarchyServiceProvider.get(languageId, new URI(selection.uri));
    }

    override async openView(args?: Partial<OpenViewArguments>): Promise<CallHierarchyTreeWidget> {
        const widget = await super.openView(args);
        const { selection, languageId } = this.editorAccess;
        widget.initializeModel(selection, languageId);
        return widget;
    }

    override registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(CallHierarchyCommands.OPEN, {
            execute: () => this.openView({
                toggle: false,
                activate: true
            }),
            isEnabled: this.isCallHierarchyAvailable.bind(this)
        });
        super.registerCommands(commands);
    }

    override registerMenus(menus: MenuModelRegistry): void {
        const menuPath = [...EDITOR_CONTEXT_MENU, 'navigation'];
        menus.registerMenuAction(menuPath, {
            commandId: CallHierarchyCommands.OPEN.id,
            label: CALL_HIERARCHY_LABEL
        });
        super.registerMenus(menus);
    }

    override registerKeybindings(keybindings: KeybindingRegistry): void {
        super.registerKeybindings(keybindings);
        keybindings.registerKeybinding({
            command: CallHierarchyCommands.OPEN.id,
            keybinding: 'ctrlcmd+f1'
        });
    }
}
