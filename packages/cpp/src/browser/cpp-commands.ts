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

import { inject, injectable } from 'inversify';
import { SelectionService, UriSelection } from '@theia/core/lib/common';
import { CommandContribution, CommandRegistry, Command } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { open, OpenerService } from '@theia/core/lib/browser';
import { CppLanguageClientContribution } from './cpp-language-client-contribution';
import { SwitchSourceHeaderRequest } from './cpp-protocol';
import { TextDocumentIdentifier } from '@theia/languages/lib/browser';
import { EditorCommands, EditorManager } from '@theia/editor/lib/browser';
import { HEADER_AND_SOURCE_FILE_EXTENSIONS } from '../common';
import { ExecuteCommandRequest, ExecuteCommandParams } from 'vscode-languageserver-protocol';
import { CppPreferences } from './cpp-preferences';

const CPP_CATEGORY = 'C/C++';

/**
 * Switch between source/header file
 */
export const SWITCH_SOURCE_HEADER: Command = {
    id: 'switch_source_header',
    category: CPP_CATEGORY,
    label: 'Switch Between Source/Header File',
};

/**
 * A command that is used to show the references from a CodeLens.
 */
export const SHOW_CLANGD_REFERENCES: Command = {
    id: 'clangd.references'
};

export const DUMP_INCLUSIONS: Command = {
    id: 'clangd.dumpinclusions',
    category: CPP_CATEGORY,
    label: 'Dump File Inclusions (Debug)',
};

export const DUMP_INCLUDED_BY: Command = {
    id: 'clangd.dumpincludedby',
    category: CPP_CATEGORY,
    label: 'Dump Files Including this File (Debug)',
};

export const REINDEX: Command = {
    id: 'clangd.reindex',
    category: CPP_CATEGORY,
    label: 'Reindex Workspace (Debug)',
};

export const PRINT_STATS: Command = {
    id: 'clangd.printstats',
    category: CPP_CATEGORY,
    label: 'Print Index Statistics (Debug)',
};

export const FILE_OPEN_PATH = (path: string): Command => <Command>{
    id: 'file:openPath'
};

export function editorContainsCppFiles(editorManager: EditorManager | undefined): boolean {
    if (editorManager && editorManager.activeEditor) {
        const uri = editorManager.activeEditor.editor.document.uri;
        return HEADER_AND_SOURCE_FILE_EXTENSIONS.some(value => uri.endsWith('.' + value));
    }
    return false;
}

@injectable()
export class CppCommandContribution implements CommandContribution {

    @inject(CppPreferences)
    private readonly cppPreferences: CppPreferences;

    constructor(
        @inject(CppLanguageClientContribution) protected readonly clientContribution: CppLanguageClientContribution,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(EditorManager) private editorService: EditorManager,
        protected readonly selectionService: SelectionService

    ) { }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(SWITCH_SOURCE_HEADER, {
            isEnabled: () => editorContainsCppFiles(this.editorService),
            execute: () => this.switchSourceHeader()
        });
        commands.registerCommand(SHOW_CLANGD_REFERENCES, {
            execute: (doc: TextDocumentIdentifier, pos: Position, locs: Location[]) =>
                commands.executeCommand(EditorCommands.SHOW_REFERENCES.id, doc.uri, pos, locs)
        });
        commands.registerCommand(REINDEX, {
            isEnabled: () => this.cppPreferences['cpp.experimentalCommands'],
            execute: () => this.reindex()
        });
        commands.registerCommand(DUMP_INCLUSIONS, {
            isEnabled: () => this.cppPreferences['cpp.experimentalCommands'] && editorContainsCppFiles(this.editorService),
            execute: () => this.dumpInclusions()
        });
        commands.registerCommand(DUMP_INCLUDED_BY, {
            isEnabled: () => this.cppPreferences['cpp.experimentalCommands'] && editorContainsCppFiles(this.editorService),
            execute: () => this.dumpIncludedBy()
        });
        commands.registerCommand(PRINT_STATS, {
            isEnabled: () => this.cppPreferences['cpp.experimentalCommands'],
            execute: () => this.printStats()
        });
    }

    protected async switchSourceHeader(): Promise<void> {
        const uri = UriSelection.getUri(this.selectionService.selection);
        if (!uri) {
            return;
        }
        const docIdentifier = TextDocumentIdentifier.create(uri.toString());
        const languageClient = await this.clientContribution.languageClient;
        const sourceUri: string | undefined = await languageClient.sendRequest(SwitchSourceHeaderRequest.type.method, docIdentifier);
        if (sourceUri !== undefined) {
            open(this.openerService, new URI(sourceUri.toString()));
        }
    }

    private async dumpInclusions(): Promise<void> {
        const uri = UriSelection.getUri(this.selectionService.selection);
        if (!uri) {
            return;
        }
        const docIdentifier = TextDocumentIdentifier.create(uri.toString());
        const params: ExecuteCommandParams = { command: DUMP_INCLUSIONS.id, arguments: [docIdentifier] };
        const languageClient = await this.clientContribution.languageClient;
        languageClient.sendRequest(ExecuteCommandRequest.type, params);
    }

    private async dumpIncludedBy(): Promise<void> {
        const uri = UriSelection.getUri(this.selectionService.selection);
        if (!uri) {
            return;
        }
        const docIdentifier = TextDocumentIdentifier.create(uri.toString());
        const params: ExecuteCommandParams = { command: DUMP_INCLUDED_BY.id, arguments: [docIdentifier] };
        const languageClient = await this.clientContribution.languageClient;
        languageClient.sendRequest(ExecuteCommandRequest.type, params);
    }

    private async reindex(): Promise<void> {
        const params: ExecuteCommandParams = { command: REINDEX.id };
        const languageClient = await this.clientContribution.languageClient;
        languageClient.sendRequest(ExecuteCommandRequest.type, params);
    }

    private async printStats(): Promise<void> {
        const params: ExecuteCommandParams = { command: PRINT_STATS.id };
        const languageClient = await this.clientContribution.languageClient;
        languageClient.sendRequest(ExecuteCommandRequest.type, params);
    }
}
