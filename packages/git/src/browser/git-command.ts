
/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Git } from '../common/git';
import { injectable, inject } from "inversify";
import { CommandContribution, CommandRegistry } from "@theia/core/lib/common";

@injectable()
export class GitCommandHandlers implements CommandContribution {

    constructor(
        @inject(Git) private git: Git
    ) { }

    registerCommands(registry: CommandRegistry): void {

        registry.registerCommand({
            id: 'git.status',
            label: 'Print Git Status'
        });
        registry.registerHandler('git.status', {
            execute: (): any => {
                console.info('STATUS');
                this.git.repositories().then(repositories => {
                    const [first,] = repositories;
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

        registry.registerCommand({
            id: 'git.repositories',
            label: 'Print All Repositories'
        });
        registry.registerHandler('git.repositories', {
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

    }
}
