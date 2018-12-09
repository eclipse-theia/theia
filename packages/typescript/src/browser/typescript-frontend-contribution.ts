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

import { injectable, inject, postConstruct } from 'inversify';
import * as tsp from 'typescript/lib/protocol';
import { Commands } from 'typescript-language-server/lib/commands';
import {
    QuickPickService, KeybindingRegistry, KeybindingContribution, QuickPickItem, StorageService, LabelProvider, FrontendApplicationContribution, StatusBar, StatusBarAlignment
} from '@theia/core/lib/browser';
import { ExecuteCommandRequest } from '@theia/languages/lib/browser';
import { FileSystemWatcher, FileMoveEvent } from '@theia/filesystem/lib/browser';
import { EditorManager, EditorWidget, EDITOR_CONTEXT_MENU, TextEditor } from '@theia/editor/lib/browser';
import { CommandContribution, CommandRegistry, Command, MenuModelRegistry, MenuContribution, DisposableCollection } from '@theia/core/lib/common';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { TYPESCRIPT_LANGUAGE_ID, TS_JS_LANGUAGES } from '../common';
import { TypeScriptClientContribution, TypescriptContributionData } from './typescript-client-contribution';
import { TypeScriptKeybindingContexts } from './typescript-keybinding-contexts';
import { TypescriptVersion } from '../common/typescript-version-service';
import URI from '@theia/core/lib/common/uri';

export namespace TypeScriptCommands {
    export const applyCompletionCodeAction: Command = {
        id: Commands.APPLY_COMPLETION_CODE_ACTION
    };
    // TODO: get rid of me when https://github.com/TypeFox/monaco-languageclient/issues/104 is resolved
    export const organizeImports: Command = {
        category: 'TypeScript',
        label: 'Organize Imports',
        id: 'typescript.edit.organizeImports'
    };
    export const openServerLog: Command = {
        category: 'TypeScript',
        label: 'Open Server Log',
        id: 'typescript.server.openLog'
    };
    export const selectVersion: Command = {
        category: 'TypeScript',
        label: 'Select Version',
        id: 'typescript.selectVersion'
    };
}

@injectable()
export class TypeScriptFrontendContribution implements FrontendApplicationContribution, CommandContribution, MenuContribution, KeybindingContribution {

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(QuickPickService)
    protected readonly quickPickService: QuickPickService;

    @inject(TypeScriptClientContribution)
    protected readonly clientContribution: TypeScriptClientContribution;

    @inject(FileSystemWatcher)
    protected readonly fileSystemWatcher: FileSystemWatcher;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(StorageService)
    protected readonly storage: StorageService;

    @postConstruct()
    protected init(): void {
        this.fileSystemWatcher.onDidMove(event => this.renameFile(event));
    }

    onStart(): void {
        this.restore();
        this.updateStatusBar();
        this.editorManager.onCurrentEditorChanged(() => this.updateStatusBar());
        this.clientContribution.onDidChangeVersion(() => this.updateStatusBar());
    }

    onStop(): void {
        this.store();
    }

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
        commands.registerCommand(TypeScriptCommands.openServerLog, {
            execute: () => this.openServerLog(),
            isEnabled: () => !!this.clientContribution.logFileUri,
            isVisible: () => !!this.clientContribution.logFileUri
        });
        commands.registerCommand(TypeScriptCommands.selectVersion, {
            execute: () => this.selectVersion()
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

    openServerLog(): void {
        const logFileUri = this.clientContribution.logFileUri;
        if (logFileUri) {
            this.editorManager.open(logFileUri);
        }
    }

    organizeImports(): void {
        const editor = MonacoEditor.get(this.currentEditor);
        if (editor) {
            // tslint:disable-next-line:no-any
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

    // tslint:disable-next-line:no-any
    protected async applyCodeAction(codeAction: tsp.CodeAction): Promise<any> {
        const client = await this.clientContribution.languageClient;
        return client.sendRequest(ExecuteCommandRequest.type, {
            command: Commands.APPLY_CODE_ACTION,
            arguments: [codeAction]
        });
    }

    protected async renameFile({ sourceUri, targetUri }: FileMoveEvent): Promise<void> {
        const client = await this.clientContribution.languageClient;
        return client.sendRequest(ExecuteCommandRequest.type, {
            command: Commands.APPLY_RENAME_FILE,
            arguments: [{
                sourceUri: sourceUri.toString(),
                targetUri: targetUri.toString()
            }]
        });
    }

    protected async selectVersion(): Promise<void> {
        const items: QuickPickItem<TypescriptVersion>[] = [];
        const currentVersion = this.clientContribution.version;
        let currentItem: QuickPickItem<TypescriptVersion> | undefined;
        for (const version of await this.clientContribution.getVersions()) {
            const item: QuickPickItem<TypescriptVersion> = {
                label: `Use ${version.qualifier} Version`,
                description: version.version,
                detail: this.labelProvider.getLongName(new URI(version.uri)),
                value: version
            };
            if (!currentItem && TypescriptVersion.equals(version, currentVersion)) {
                currentItem = item;
            }
            items.push(item);
        }
        if (!currentItem) {
            currentItem = items[0];
        }
        if (currentItem) {
            currentItem.label = '• ' + currentItem.label;
        }
        const selectedVersion = await this.quickPickService.show(items, {
            placeholder: 'Select the TypeScript version used for JavaScript and TypeScript language features'
        });
        if (selectedVersion) {
            this.clientContribution.setVersion(selectedVersion);
        }
    }

    protected storageKey = 'typescript.contribution';
    protected async restore(): Promise<void> {
        const data = await this.storage.getData<TypescriptContributionData>(this.storageKey);
        await this.clientContribution.restore(data);
    }
    protected async store(): Promise<void> {
        const data = this.clientContribution.store();
        await this.storage.setData(this.storageKey, data);
    }

    protected readonly toDisposeOnCurrentEditorChanged = new DisposableCollection();
    protected updateStatusBar(): void {
        this.toDisposeOnCurrentEditorChanged.dispose();

        const widget = this.editorManager.currentEditor;
        const editor = widget && widget.editor;
        this.updateVersionStatus(editor);
        if (editor) {
            this.toDisposeOnCurrentEditorChanged.push(
                editor.onLanguageChanged(() => this.updateVersionStatus(editor))
            );
        }
    }
    protected updateVersionStatus(editor: TextEditor | undefined): void {
        const version = this.clientContribution.version;
        const languageId = editor && editor.document.languageId;
        if (!languageId || !TS_JS_LANGUAGES.has(languageId) || !version) {
            this.statusBar.removeElement('editor-ts-version');
            return;
        }
        this.statusBar.setElement('editor-ts-version', {
            text: version.version,
            alignment: StatusBarAlignment.RIGHT,
            priority: 0.9,
            command: TypeScriptCommands.selectVersion.id
        });
    }

}
