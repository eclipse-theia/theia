/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import * as tsp from 'typescript/lib/protocol';
import { Commands } from 'typescript-language-server/lib/commands';
import { QuickPickService, KeybindingRegistry, KeybindingContribution } from '@theia/core/lib/browser';
import { ExecuteCommandRequest } from '@theia/languages/lib/browser';
import { EditorManager, EditorWidget, EDITOR_CONTEXT_MENU } from '@theia/editor/lib/browser';
import { CommandContribution, CommandRegistry, Command, MenuModelRegistry, MenuContribution } from '@theia/core/lib/common';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { TYPESCRIPT_LANGUAGE_ID } from '../common';
import { TypeScriptClientContribution } from './typescript-client-contribution';
import { TypeScriptKeybindingContexts } from './typescript-keybinding-contexts';

export namespace TypeScriptCommands {
    export const applyCompletionCodeAction: Command = {
        id: Commands.APPLY_COMPLETION_CODE_ACTION
    };
    // TODO: get rid of me when https://github.com/TypeFox/monaco-languageclient/issues/104 is resolved
    export const organizeImports: Command = {
        label: 'TypeScript: Organize Imports',
        id: 'typescript.edit.organizeImports'
    };
}

@injectable()
export class TypeScriptFrontendContribution implements CommandContribution, MenuContribution, KeybindingContribution {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(QuickPickService)
    protected readonly quickPickService: QuickPickService;

    @inject(TypeScriptClientContribution)
    protected readonly clientContribution: TypeScriptClientContribution;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(TypeScriptCommands.applyCompletionCodeAction, {
            execute: async (file: string, codeActions: tsp.CodeAction[]) => {
                const codeAction = await this.pickCodeAction(codeActions);
                return codeAction && this.applyCodeAction(codeAction);
            }
        });
        commands.registerCommand(TypeScriptCommands.organizeImports, {
            execute: () => this.organizeImports(),
            isEnabled: () => !!this.currentEditor,
            isVisible: () => !!this.currentEditor
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction([...EDITOR_CONTEXT_MENU, '1_modification'], {
            commandId: TypeScriptCommands.organizeImports.id,
            label: 'Organize Imports'
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: TypeScriptCommands.organizeImports.id,
            context: TypeScriptKeybindingContexts.typescriptEditorTextFocus,
            keybinding: 'shift+alt+o'
        });
    }

    organizeImports(): void {
        const editor = MonacoEditor.get(this.currentEditor);
        if (editor) {
            const action = editor.getControl().getAction('editor.action.organizeImports') as any;
            // workaround isSupported check
            action._run();
        }
    }

    get currentEditor(): EditorWidget | undefined {
        const { currentEditor } = this.editorManager;
        if (currentEditor && currentEditor.editor.document.languageId === TYPESCRIPT_LANGUAGE_ID) {
            return currentEditor;
        }
        return undefined;
    }

    protected pickCodeAction(codeActions: tsp.CodeAction[]): Promise<tsp.CodeAction | undefined> {
        return this.quickPickService.show<tsp.CodeAction>(codeActions.map(value => ({
            label: value.description,
            value
        }), {
                placeholder: 'Select code action to apply'
            }
        ));
    }

    protected async applyCodeAction(codeAction: tsp.CodeAction): Promise<any> {
        const client = await this.clientContribution.languageClient;
        return client.sendRequest(ExecuteCommandRequest.type, {
            command: Commands.APPLY_CODE_ACTION,
            arguments: [codeAction]
        });
    }

}
