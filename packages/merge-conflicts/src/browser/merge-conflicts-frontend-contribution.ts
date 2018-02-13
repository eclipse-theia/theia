/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { Languages, Workspace } from '@theia/languages/lib/common';
import { MergeConflictsCodeLensProvider } from './merge-conflicts-code-lense-provider';
import { MergeConflictResolver } from './merge-conflict-resolver';
import { MergeConflictsCommands as Commands } from './merge-conflict';
import { MergeConflictsService } from "./merge-conflicts-service";
import { MergeConflictsDecorations } from "./merge-conflicts-decorations";

@injectable()
export class MergeConflictsFrontendContribution implements FrontendApplicationContribution, CommandContribution {

    constructor(
        @inject(Languages) protected readonly languages: Languages,
        @inject(MergeConflictsCodeLensProvider) protected readonly mergeConflictsCodeLensProvider: MergeConflictsCodeLensProvider,
        @inject(MergeConflictResolver) protected readonly mergeConflictResolver: MergeConflictResolver,
        @inject(MergeConflictsDecorations) protected readonly mergeConflictsDecorations: MergeConflictsDecorations,
        @inject(MergeConflictsService) protected readonly mergeConflictsService: MergeConflictsService,
        @inject(Workspace) protected readonly workspace: Workspace,
    ) { }

    onStart(app: FrontendApplication): void {
        if (this.languages.registerCodeLensProvider) {
            this.languages.registerCodeLensProvider([{ pattern: '**/*' }], this.mergeConflictsCodeLensProvider);
        }
        this.workspace.onDidOpenTextDocument(document => {
            window.setTimeout(() => {
                this.updateEditorDecorations(document.uri);
            }, 1);
        });
        this.workspace.onDidChangeTextDocument(params => this.updateEditorDecorations(params.textDocument.uri));
        this.mergeConflictsService.onMergeConflictUpdate(params => this.mergeConflictsDecorations.onMergeConflictUpdate(params));
    }

    protected updateEditorDecorations(uri: string) {
        this.mergeConflictsService.get(uri);
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(Commands.AcceptCurrent, this.mergeConflictResolver.acceptCurrent);
        registry.registerCommand(Commands.AcceptIncoming, this.mergeConflictResolver.acceptIncoming);
        registry.registerCommand(Commands.AcceptBoth, this.mergeConflictResolver.acceptBoth);
    }
}
