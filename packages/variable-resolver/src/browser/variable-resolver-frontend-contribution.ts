/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { injectable, inject, named } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { Command, CommandContribution, CommandRegistry, ContributionProvider } from '@theia/core/lib/common';
import { VariableContribution, VariableRegistry } from './variable';
import { VariableQuickOpenService } from './variable-quick-open-service';

export const LIST_VARIABLES: Command = {
    id: 'variable.list',
    label: 'Variable: List All'
};

@injectable()
export class VariableResolverFrontendContribution implements FrontendApplicationContribution, CommandContribution {

    constructor(
        @inject(ContributionProvider) @named(VariableContribution)
        protected readonly contributionProvider: ContributionProvider<VariableContribution>,
        @inject(VariableRegistry) protected readonly variableRegistry: VariableRegistry,
        @inject(VariableQuickOpenService) protected readonly variableQuickOpenService: VariableQuickOpenService
    ) { }

    onStart(): void {
        this.contributionProvider.getContributions().forEach(contrib =>
            contrib.registerVariables(this.variableRegistry)
        );
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(LIST_VARIABLES, {
            isEnabled: () => true,
            execute: () => this.variableQuickOpenService.open()
        });
    }
}
