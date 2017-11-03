/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from "inversify";
import { SelectionService } from '@theia/core/lib/common';
import { CommandContribution, CommandRegistry, Command } from '@theia/core/lib/common';
import URI from "@theia/core/lib/common/uri";
import { open, OpenerService } from '@theia/core/lib/browser';
import { CppClientContribution } from "./cpp-client-contribution";
import { TextDocumentItemRequest, AnyRequest } from "./cpp-protocol";
import { TextDocumentIdentifier } from "@theia/languages/lib/common";
import { DirNode, FileDialogFactory, FileStatNode } from '@theia/filesystem/lib/browser';
import { EditorManager } from "@theia/editor/lib/browser";
import { FileSystem } from '@theia/filesystem/lib/common';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';

export namespace Commands {

    export const OPEN: Command = {
        id: 'cpp:open',
        label: 'Specify folder location...'
    };

    /**
     * Switch between source/header file
     */
    export const SWITCH_SOURCE_HEADER: Command = {
        id: 'switch_source_header',
        label: 'Switch between source/header file'
    };

    /**
     * Switch between source/header file
     */
    export const CHANGE_CONFIGURATION: Command = {
        id: 'change_configuration',
        label: 'Change Clangd Configuration'
    };

}

export interface DidChangeConfigurationParams {
    /**
    * The actual changed settings
    */
    settings: ClangdConfigurationParams;
}

export interface ClangdConfigurationParams {
    /**
    * The compilation database path
    */
    compilationDatabasePath?: string;
}

@injectable()
export class CppCommandContribution implements CommandContribution {

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(FileDialogFactory) protected readonly fileDialogFactory: FileDialogFactory,
        @inject(CppClientContribution) protected readonly clientContribution: CppClientContribution,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(EditorManager) private editorService: EditorManager,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        protected readonly selectionService: SelectionService

    ) { }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(Commands.SWITCH_SOURCE_HEADER, {
            isEnabled: () => (this.editorService && !!this.editorService.activeEditor &&
                (this.editorService.activeEditor.editor.document.uri.endsWith(".cpp") || this.editorService.activeEditor.editor.document.uri.endsWith(".h"))),
            execute: () => {
                this.switchSourceHeader();
            }
        });
        commands.registerCommand(Commands.CHANGE_CONFIGURATION, {
            isEnabled: () => (this.editorService && !!this.editorService.activeEditor &&
                (this.editorService.activeEditor.editor.document.uri.endsWith(".cpp") || this.editorService.activeEditor.editor.document.uri.endsWith(".h"))),
            execute: () => {
                this.changeConfiguration();
            }
        });

    }

    protected switchSourceHeader(): void {
        const docIdentifier = TextDocumentIdentifier.create(this.selectionService.selection.uri.toString());
        this.clientContribution.languageClient.then((languageClient) => {
            languageClient.sendRequest(TextDocumentItemRequest.type, docIdentifier).then(sourceUri => {
                if (sourceUri !== undefined) {
                    open(this.openerService, new URI(sourceUri.toString()));
                }
            });
        });
    }

    protected changeConfiguration(): void {
        this.workspaceService.tryRoot.then(async resolvedRoot => {
            const root = resolvedRoot || await this.fileSystem.getCurrentUserHome();
            const rootUri = new URI(root.uri).parent;
            const rootStat = await this.fileSystem.getFileStat(rootUri.toString());
            const rootNode = DirNode.createRoot(rootStat);
            const dialog = this.fileDialogFactory({ title: Commands.OPEN.label! });
            dialog.model.navigateTo(rootNode);
            const node = await dialog.open();
            let targetFolder: string = this.getTargetFolder(node);

            this.clientContribution.languageClient.then((languageClient) => {
                let configParams: ClangdConfigurationParams = { compilationDatabasePath: targetFolder };
                let interfaceParams: DidChangeConfigurationParams = { settings: configParams };
                languageClient.sendRequest(AnyRequest.type, interfaceParams);
            });
        });
    }

    protected getTargetFolder(node: Readonly<FileStatNode> | undefined): string {
        if (!node) {
            return "";
        }
        return node.uri.path.toString();
    }
}
