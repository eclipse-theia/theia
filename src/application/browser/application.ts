/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'reflect-metadata';
import { CommandRegistry } from '../common/command';
import { KeybindingRegistry } from '../common/keybinding';
import { MenuModelRegistry } from '../common/menu';
import { ApplicationShell } from './shell';
import { Application } from '@phosphor/application';
import { inject, injectable, interfaces, multiInject } from 'inversify';

export const TheiaPlugin = Symbol("TheiaPlugin");
/**
 * Clients can subclass to get a callback for contributing widgets to a shell on start.
 */
export interface TheiaPlugin {
    /**
     * Callback
     */
    onStart(app: TheiaApplication): void;
}

@injectable()
export class TheiaApplication {

    readonly shell: ApplicationShell;
    private application: Application<ApplicationShell>;
    private container: interfaces.Container | undefined;

    constructor(
        @inject(CommandRegistry) commandRegistry: CommandRegistry,
        @inject(MenuModelRegistry) menuRegistry: MenuModelRegistry,
        @inject(KeybindingRegistry) keybindingRegistry: KeybindingRegistry,
        @multiInject(TheiaPlugin) contributions: TheiaPlugin[]) {

        this.shell = new ApplicationShell();
        this.application = new Application<ApplicationShell>({
            shell: this.shell
        });
        this.application.started.then(() => {
            commandRegistry.initialize();
            keybindingRegistry.initialize();
            menuRegistry.initialize();
            contributions.forEach(c => c.onStart(this));
        })
    }

    start(container?: interfaces.Container): Promise<void> {
        this.container = container;
        return this.application.start();
    }

}
