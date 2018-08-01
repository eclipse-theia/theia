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
import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { Languages } from '@theia/languages/lib/browser';
import { MergeConflictsCodeLensProvider } from './merge-conflicts-code-lense-provider';
import { MergeConflictResolver } from './merge-conflict-resolver';
import { MergeConflictsCommands as Commands } from './merge-conflict';
import { MergeConflictsProvider } from './merge-conflicts-provider';
import { MergeConflictsDecorations } from './merge-conflicts-decorations';

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
        registry.registerCommand({ id: Commands.AcceptCurrent.id }, this.mergeConflictResolver.acceptCurrent);
        registry.registerCommand({ id: Commands.AcceptIncoming.id }, this.mergeConflictResolver.acceptIncoming);
        registry.registerCommand({ id: Commands.AcceptBoth.id }, this.mergeConflictResolver.acceptBoth);
    }
}
