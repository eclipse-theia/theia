/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from "inversify";
import { SelectionService } from '@theia/core/lib/common';
import { CommandContribution, MenuModelRegistry, MenuContribution, CommandRegistry, Command } from '@theia/core/lib/common';
import URI from "@theia/core/lib/common/uri";
import { open, OpenerService } from '@theia/core/lib/browser';
import { CppClientContribution } from "./cpp-client-contribution";
import { TextDocumentItemRequest } from "./cpp-protocol";
import { TextDocumentIdentifier } from "@theia/languages/lib/common";
import { EDITOR_CONTEXT_MENU_ID } from "@theia/editor/lib/browser";


/**
 * Switch between source/header file
 */
export const SWITCH_SOURCE_HEADER: Command = {
    id: 'switch_source_header',
    label: 'Switch between source/header file'
};

export const FILE_OPEN_PATH = (path: string): Command => <Command>{
    id: `file:openPath`
};

@injectable()
export class CppCommandContribution implements CommandContribution, MenuContribution {

    constructor(
        // @inject(SelectionService) protected readonly selectionService: SelectionService,
        @inject(CppClientContribution) protected readonly clientContribution: CppClientContribution,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        protected readonly selectionService: SelectionService

    ) { }


    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(SWITCH_SOURCE_HEADER, {
            isEnabled: () => true,
            execute: () => this.switchSourceHeader()
        });

    }

    registerMenus(registry: MenuModelRegistry) {
        registry.registerMenuAction([EDITOR_CONTEXT_MENU_ID, "1_undo/redo"], {
            commandId: SWITCH_SOURCE_HEADER.id
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
}
