/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, named } from 'inversify';
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
