/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'reflect-metadata';
import { inject, injectable, named, decorate } from 'inversify';
import { Widget } from "@phosphor/widgets";
import { Application } from '@phosphor/application';
import { ContributionProvider, CommandRegistry, KeybindingRegistry, MenuModelRegistry } from '../common';
import { ApplicationShell } from './shell';

decorate(injectable(), Widget);

/**
 * Clients can implement to get a callback for contributing widgets to a shell on start.
 */
export const FrontendApplicationContribution = Symbol("FrontendApplicationContribution");
export interface FrontendApplicationContribution {
    /**
     * Callback
     */
    onStart(app: FrontendApplication): void;
}

@injectable()
export class FrontendApplication {

    readonly shell: ApplicationShell;
    private application: Application<ApplicationShell>;

    constructor(
        @inject(CommandRegistry) commandRegistry: CommandRegistry,
        @inject(MenuModelRegistry) menuRegistry: MenuModelRegistry,
        @inject(KeybindingRegistry) keybindingRegistry: KeybindingRegistry,
        @inject(ContributionProvider) @named(FrontendApplicationContribution) contributions: ContributionProvider<FrontendApplicationContribution>) {

        this.shell = new ApplicationShell();
        this.application = new Application<ApplicationShell>({
            shell: this.shell
        });
        this.application.started.then(() => {
            commandRegistry.initialize();
            keybindingRegistry.initialize();
            menuRegistry.initialize();
            contributions.getContributions().forEach(c => c.onStart(this));
        })
    }

    start(): Promise<void> {
        return this.application.start();
    }

}
