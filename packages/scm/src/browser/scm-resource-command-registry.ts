/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { injectable, named, inject } from 'inversify';
import { ContributionProvider } from '@theia/core';

export const ScmResourceCommandContribution = Symbol('ScmResourceCommandContribution');

export interface ScmResourceCommandContribution {
    registerScmResourceCommands(registry: ScmResourceCommandRegistry): void;
}

@injectable()
export class ScmResourceCommandRegistry implements FrontendApplicationContribution {
    private commands: Map<string, string[]> = new Map();

    @inject(ContributionProvider)
    @named(ScmResourceCommandContribution)
    protected readonly contributionProvider: ContributionProvider<ScmResourceCommandContribution>;

    onStart(): void {
        const contributions = this.contributionProvider.getContributions();
        for (const contribution of contributions) {
            contribution.registerScmResourceCommands(this);
        }
    }

    registerCommands(groupId: string, commands: string[]): void {
        const savedCommands = this.commands.get(groupId);
        if (savedCommands) {
            commands.forEach(command => savedCommands.push(command));
            this.commands.set(groupId, savedCommands);
        } else {
            this.commands.set(groupId, commands);
        }
    }

    registerCommand(groupId: string, command: string): void {
        const commands = this.commands.get(groupId);
        if (commands) {
            commands.push(command);
            this.commands.set(groupId, commands);
        } else {
            this.commands.set(groupId, [command]);
        }
    }

    getCommands(groupId: string): string[] | undefined {
        return this.commands.get(groupId);
    }
}
