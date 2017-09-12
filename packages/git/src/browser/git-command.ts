/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Git } from '../common/git';
import { injectable, inject } from "inversify";
import { CommandContribution, CommandRegistry } from "@theia/core/lib/common";

export namespace GIT_COMMANDS {
    export const STATUS = {
        id: 'git.status',
        label: 'Print Git Status'
    };
    export const REPOSITORIES = {
        id: 'git.repositories',
        label: 'Print All Repositories'
    };
    export const FETCH = {
        id: 'git.fetch',
        label: 'Fetch'
    };
    export const PULL = {
        id: 'git.pull',
        label: 'Pull'
    };
    export const MERGE = {
        id: 'git.merge',
        label: 'Merge'
    };
    export const COMMIT = {
        id: 'git.commit',
        label: 'Commit'
    };
    export const PUSH = {
        id: 'git.push',
        label: 'Push'
    };
}

@injectable()
export class GitCommandHandlers implements CommandContribution {

    constructor(
        @inject(Git) private git: Git
    ) { }

    registerCommands(registry: CommandRegistry): void {

        registry.registerCommand(GIT_COMMANDS.STATUS);
        registry.registerHandler(GIT_COMMANDS.STATUS.id, {
            execute: (): any => {
                this.git.repositories().then(repositories => {
                    const first = repositories.shift();
                    if (first) {
                        this.git.status(first).then(status => {
                            console.info(status);
                        });
                    } else {
                        console.info('No repositories were found.');
                    }
                });
                return undefined;
            },
            isEnabled: () => true
        });

        registry.registerCommand(GIT_COMMANDS.REPOSITORIES);
        registry.registerHandler(GIT_COMMANDS.REPOSITORIES.id, {
            execute: (): any => {
                this.git.repositories().then(repositories => {
                    if (!repositories) {
                        console.info('No repositories were found.');
                    } else {
                        repositories.forEach(r => console.info(r));
                    }
                });
                return undefined;
            },
            isEnabled: () => true
        });

        registry.registerCommand(GIT_COMMANDS.FETCH);
        registry.registerHandler(GIT_COMMANDS.FETCH.id, {
            execute: (): any => {
                this.git.fetch();
            },
            isEnabled: () => true
        });

        registry.registerCommand(GIT_COMMANDS.COMMIT);
        registry.registerHandler(GIT_COMMANDS.COMMIT.id, {
            execute: (): any => {
                console.log('COMMIT');
            },
            isEnabled: () => true
        });

        registry.registerCommand(GIT_COMMANDS.PULL);
        registry.registerHandler(GIT_COMMANDS.PULL.id, {
            execute: (): any => {
                console.log('PULL');
            },
            isEnabled: () => true
        });

        registry.registerCommand(GIT_COMMANDS.MERGE);
        registry.registerHandler(GIT_COMMANDS.MERGE.id, {
            execute: (): any => {
                console.log('MERGE');
            },
            isEnabled: () => true
        });

        registry.registerCommand(GIT_COMMANDS.PUSH);
        registry.registerHandler(GIT_COMMANDS.PUSH.id, {
            execute: (): any => {
                console.log('PUSH');
            },
            isEnabled: () => true
        });

    }
}
