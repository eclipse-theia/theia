/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { Languages } from '@theia/languages/lib/common';
import { MergeConflictsCodeLensProvider } from './merge-conflicts-code-lense-provider';
import { MergeConflictResolver } from './merge-conflict-resolver';
import { MergeConflictsCommands as Commands } from './merge-conflict';
import { MergeConflictsProvider } from "./merge-conflicts-provider";
import { MergeConflictsDecorations } from "./merge-conflicts-decorations";

@injectable()
export class MergeConflictsFrontendContribution implements FrontendApplicationContribution, CommandContribution {

    @inject(Languages)
    protected readonly languages: Languages;

    @inject(MergeConflictsCodeLensProvider)
    protected readonly mergeConflictsCodeLensProvider: MergeConflictsCodeLensProvider;

    @inject(MergeConflictResolver)
    protected readonly mergeConflictResolver: MergeConflictResolver;

    @inject(MergeConflictsDecorations)
    protected readonly decorator: MergeConflictsDecorations;

    @inject(MergeConflictsProvider)
    protected readonly mergeConflictsProvider: MergeConflictsProvider;

    onStart(app: FrontendApplication): void {
        if (this.languages.registerCodeLensProvider) {
            this.languages.registerCodeLensProvider([{ pattern: '**/*' }], this.mergeConflictsCodeLensProvider);
        }
        this.mergeConflictsProvider.onDidUpdate(params => this.decorator.decorate(params));
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(Commands.AcceptCurrent, this.mergeConflictResolver.acceptCurrent);
        registry.registerCommand(Commands.AcceptIncoming, this.mergeConflictResolver.acceptIncoming);
        registry.registerCommand(Commands.AcceptBoth, this.mergeConflictResolver.acceptBoth);
    }
}
