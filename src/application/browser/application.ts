/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'reflect-metadata';
import { inject, injectable, named } from 'inversify';
import { Application } from '@phosphor/application';
import { ContributionProvider, CommandRegistry, KeybindingRegistry, MenuModelRegistry } from '../common';
import { ApplicationShell } from './shell';

/**
 * Clients can implement to get a callback for contributing widgets to a shell on start.
 */
export const FrontendApplicationContribution = Symbol("FrontendApplicationContribution");
export interface FrontendApplicationContribution {
    /**
     * At the initialization phase an application contribution can contribute commands, keybindings and menus.
     */
    onInitialize?(app: FrontendApplication): void;
    /**
     * When the application is started an application contribution can access existing commands, keybindings, menus,
     * but should not contribute new.
     */
    onStart?(app: FrontendApplication): void;
}

@injectable()
export class FrontendApplication {

    readonly shell: ApplicationShell;
    private application: Application<ApplicationShell>;

    constructor(
        @inject(CommandRegistry) readonly commands: CommandRegistry,
        @inject(MenuModelRegistry) readonly menus: MenuModelRegistry,
        @inject(KeybindingRegistry) readonly keybindings: KeybindingRegistry,
        @inject(ContributionProvider) @named(FrontendApplicationContribution) contributions: ContributionProvider<FrontendApplicationContribution>
    ) {
        this.shell = new ApplicationShell();
        this.application = new Application<ApplicationShell>({
            shell: this.shell
        });
        this.application.started.then(() => {
            commands.initialize();
            keybindings.initialize();
            menus.initialize();
            const appContributions = contributions.getContributions();
            for (const contribution of appContributions) {
                if (contribution.onInitialize) {
                    contribution.onInitialize(this);
                }
            }
            for (const contribution of appContributions) {
                if (contribution.onStart) {
                    contribution.onStart(this);
                }
            }
        });
    }

    start(): Promise<void> {
        return this.application.start();
    }

}
