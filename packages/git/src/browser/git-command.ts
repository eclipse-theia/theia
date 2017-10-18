/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import { injectable, inject } from "inversify";
import { CommandContribution, CommandRegistry } from "@theia/core/lib/common";
import { GitQuickOpenService } from './git-quick-open-service';
import { GitRepositoryProvider } from './git-repository-provider';

export namespace GIT_COMMANDS {
    export const FETCH = {
        id: 'git.fetch',
        label: 'Fetch'
    };
    export const PULL = {
        id: 'git.pull',
        label: 'Pull'
    };
    export const PUSH = {
        id: 'git.push',
        label: 'Push'
    };
    export const MERGE = {
        id: 'git.merge',
        label: 'Merge'
    };
}

@injectable()
export class GitCommandHandlers implements CommandContribution {

    constructor(
        @inject(GitQuickOpenService) protected readonly quickOpenService: GitQuickOpenService,
        @inject(GitRepositoryProvider) protected readonly repositoryProvider: GitRepositoryProvider
    ) { }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(GIT_COMMANDS.FETCH);
        registry.registerHandler(GIT_COMMANDS.FETCH.id, {
            execute: () => this.quickOpenService.fetch(),
            isEnabled: () => this.repositorySelected
        });

        registry.registerCommand(GIT_COMMANDS.PULL);
        registry.registerHandler(GIT_COMMANDS.PULL.id, {
            execute: () => this.quickOpenService.pull(),
            isEnabled: () => this.repositorySelected
        });

        registry.registerCommand(GIT_COMMANDS.PUSH);
        registry.registerHandler(GIT_COMMANDS.PUSH.id, {
            execute: () => this.quickOpenService.push(),
            isEnabled: () => this.repositorySelected
        });

        registry.registerCommand(GIT_COMMANDS.MERGE);
        registry.registerHandler(GIT_COMMANDS.MERGE.id, {
            execute: () => this.quickOpenService.merge(),
            isEnabled: () => this.repositorySelected
        });

    }

    protected get repositorySelected(): boolean {
        return this.repositoryProvider.selectedRepository !== undefined;
    }
}
