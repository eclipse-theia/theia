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
import { SwitchSourceHeaderRequest } from "./cpp-protocol";
import { TextDocumentIdentifier, DidChangeConfigurationParams, DidChangeConfigurationNotification } from "@theia/languages/lib/common";
import { FileDialogFactory, DirNode } from '@theia/filesystem/lib/browser';
import { EditorManager } from "@theia/editor/lib/browser";
import { HEADER_AND_SOURCE_FILE_EXTENSIONS } from '../common';
import { FileSystem } from "@theia/filesystem/lib/common";
import { WorkspaceService } from "@theia/workspace/lib/browser";
import { LabelProvider } from "@theia/core/lib/browser/label-provider";

export namespace CppCommands {
    /**
     * Switch between source/header file
     */
    export const SWITCH_SOURCE_HEADER: Command = {
        id: 'cpp.switch.source.header',
        label: 'Switch between source/header file'
    };

    /**
     * Change clangd configuration
     */
    export const CHANGE_CONFIGURATION: Command = {
        id: 'cpp.change.configuration',
        label: 'Select a compile_commands.json.'
    };

}

export interface ClangdConfigurationParams {
    /**
     * The compilation database path
     */
    compilationDatabasePath?: string;
}

export function editorContainsCppFiles(editorManager: EditorManager | undefined): boolean {
    if (editorManager && editorManager.activeEditor) {
        const uri = editorManager.activeEditor.editor.document.uri;
        return HEADER_AND_SOURCE_FILE_EXTENSIONS.some(value => uri.endsWith("." + value));
    }
    return false;
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
        @inject(LabelProvider) protected readonly labelProvider: LabelProvider,
        protected readonly selectionService: SelectionService

    ) { }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(CppCommands.SWITCH_SOURCE_HEADER, {
            isEnabled: () => editorContainsCppFiles(this.editorService),
            execute: () => this.switchSourceHeader()
        });

        commands.registerCommand(CppCommands.CHANGE_CONFIGURATION, {
            isEnabled: () => editorContainsCppFiles(this.editorService),
            execute: () => this.changeConfiguration()
        });
    }

    protected switchSourceHeader(): void {
        const docIdentifier = TextDocumentIdentifier.create(this.selectionService.selection.uri.toString());
        this.clientContribution.languageClient.then(languageClient => {
            languageClient.sendRequest(SwitchSourceHeaderRequest.type, docIdentifier).then(sourceUri => {
                if (sourceUri !== undefined) {
                    open(this.openerService, new URI(sourceUri.toString()));
                }
            });
        });
    }

    protected async changeConfiguration() {
        const root = await this.workspaceService.root;
        if (!root) {
            return;
        }

        const rootUri = new URI(root.uri);
        const rootStat = await this.fileSystem.getFileStat(rootUri.toString());
        const name = this.labelProvider.getName(rootUri);
        const icon = await this.labelProvider.getIcon(rootUri);
        const rootNode = DirNode.createRoot(rootStat, name, icon);
        const dialog = this.fileDialogFactory({ title: CppCommands.CHANGE_CONFIGURATION.label! });
        dialog.model.navigateTo(rootNode);
        const node = await dialog.open();

        if (!node || !node.fileStat.isDirectory) {
            return;
        }

        const targetFolder: string = node.uri.path.toString();

        const interfaceParams: DidChangeConfigurationParams = {
            settings: {
                compilationDatabasePath: targetFolder,
            },
        };

        const languageClient = await this.clientContribution.languageClient;
        languageClient.sendNotification(DidChangeConfigurationNotification.type, interfaceParams); // AnyRequest

    }
}
