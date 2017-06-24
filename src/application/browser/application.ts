/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'reflect-metadata';
import { inject, injectable, named } from 'inversify';
import { ContributionProvider, CommandRegistry, KeybindingRegistry, MenuModelRegistry } from '../common';
import { ApplicationShell } from './shell';
import { Widget } from "./widgets";

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

    protected _shell: ApplicationShell | undefined;

    constructor(
        @inject(CommandRegistry) protected readonly commands: CommandRegistry,
        @inject(MenuModelRegistry) protected readonly menus: MenuModelRegistry,
        @inject(KeybindingRegistry) protected readonly keybindings: KeybindingRegistry,
        @inject(ContributionProvider) @named(FrontendApplicationContribution)
        protected readonly contributions: ContributionProvider<FrontendApplicationContribution>
    ) { }

    get shell(): ApplicationShell {
        if (this._shell) {
            return this._shell;
        }
        throw new Error('The application has not been started yet.');
    }

    /**
     * Start the frontend application.
     *
     * Start up consists of the following steps:
     * - create the application shell
     * - start frontend contributions
     * - display the application shell
     */
    start(): void {
        if (this._shell) {
            throw new Error('The application is already running.');
        }
        this._shell = this.createShell();
        this.startContributions();
        this.attachShell();
    }

    protected createShell(): ApplicationShell {
        return new ApplicationShell();
    }

    protected attachShell(): void {
        Widget.attach(this.shell, this.host);
        const listener = () => this.shell.update();
        window.addEventListener('resize', listener);
    }

    protected get host(): HTMLElement {
        return this.getHost();
    }

    protected getHost(): HTMLElement {
        return document.body;
    }

    protected startContributions(): void {
        /**
         * FIXME:
         * - decouple commands & menus
         * - consider treat commands, keybindings and menus as frontend application contributions
         */
        this.commands.onStart();
        this.keybindings.onStart();
        this.menus.onStart();
        for (const contribution of this.contributions.getContributions()) {
            contribution.onStart(this);
        }
    }

}
