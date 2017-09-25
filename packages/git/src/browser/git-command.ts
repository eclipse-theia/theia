/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { CommandContribution, CommandRegistry, ILogger } from "@theia/core/lib/common";

export namespace GIT_COMMANDS {
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
    export const PUSH = {
        id: 'git.push',
        label: 'Push'
    };
}

@injectable()
export class GitCommandHandlers implements CommandContribution {

    constructor(
        @inject(ILogger) protected readonly logger: ILogger
    ) { }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(GIT_COMMANDS.FETCH);
        registry.registerHandler(GIT_COMMANDS.FETCH.id, {
            execute: (): any => {
                this.logger.info('FETCH');
            },
            isEnabled: () => true
        });

        registry.registerCommand(GIT_COMMANDS.PULL);
        registry.registerHandler(GIT_COMMANDS.PULL.id, {
            execute: (): any => {
                this.logger.info('PULL');
            },
            isEnabled: () => true
        });

        registry.registerCommand(GIT_COMMANDS.MERGE);
        registry.registerHandler(GIT_COMMANDS.MERGE.id, {
            execute: (): any => {
                this.logger.info('MERGE');
            },
            isEnabled: () => true
        });

        registry.registerCommand(GIT_COMMANDS.PUSH);
        registry.registerHandler(GIT_COMMANDS.PUSH.id, {
            execute: (): any => {
                this.logger.info('PUSH');
            },
            isEnabled: () => true
        });

    }
}
