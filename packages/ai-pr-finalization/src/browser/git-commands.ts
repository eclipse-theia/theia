// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { GitShellService } from '../common/git-shell-service-protocol';
import { AICommandHandlerFactory } from '@theia/ai-core/lib/browser';

@injectable()
export class GitCommandContribution implements CommandContribution {

    @inject(WorkspaceService)
    protected workspaceService: WorkspaceService;
    @inject(GitShellService)
    protected gitShellService: GitShellService;
    @inject(AICommandHandlerFactory)
    protected commandHandlerFactory: AICommandHandlerFactory;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(GitStatusCommand, this.commandHandlerFactory({
            execute: () => this.getGitStatus()
        }));
        commands.registerCommand(GitDiffCommand, this.commandHandlerFactory({
            execute: () => this.getGitDiff()
        }));
    }

    protected getGitStatus(): Promise<string> {
        return this.getGitOutput('status');
    }

    protected getGitDiff(): Promise<string> {
        return this.getGitOutput('diff');
    }

    protected getGitOutput(...command: string[]): Promise<string> {
        const root = this.workspaceService.tryGetRoots()[0];
        if (root) {
            const rootPath = root.resource.path.toString();
            // TODO potentially catch rejected promise and rethrow with more context
            return this.gitShellService.executeGitCommand(['-C', rootPath, ...command]);
        } else {
            throw new Error('failed to get git info: no workspace root found');
        }
    }
}

export const GitStatusCommand: Command = {
    id: 'ai-pr-finalization:git-status',
    label: 'Get Git Status output'
};

export const GitDiffCommand: Command = {
    id: 'ai-pr-finalization:git-diff',
    label: 'Get Git Diff output'
};
