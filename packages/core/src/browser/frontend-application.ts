/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable, named } from 'inversify';
import { ContributionProvider, CommandRegistry, KeybindingRegistry, MenuModelRegistry } from '../common';
import { ApplicationShell, ShellLayoutRestorer } from './shell';
import { Widget } from "./widgets";
import { ILogger } from '../common';
import { MaybePromise } from '../common/types';

/**
 * Clients can implement to get a callback for contributing widgets to a shell on start.
 */
export const FrontendApplicationContribution = Symbol("FrontendApplicationContribution");
export interface FrontendApplicationContribution {

    /**
     * Called on application startup before onStart is called.
     */
    initialize?(): void;

    /**
     * Called when the application is started.
     * Should return a promise if it runs asynchronously.
     */
    onStart?(app: FrontendApplication): MaybePromise<void>;

    /**
     * Called when an application is stopped or unloaded.
     *
     * Note that this is implemented using `window.unload` which doesn't allow any asynchronous code anymore. I.e. this is the last tick.
     */
    onStop?(app: FrontendApplication): void;

    /**
     * called after start, when there is no previous workbench layout state.
     * Should return a promise if it runs asynchronously.
     */
    initializeLayout?(app: FrontendApplication): MaybePromise<void>;
}

@injectable()
export class FrontendApplication {

    constructor(
        @inject(CommandRegistry) protected readonly commands: CommandRegistry,
        @inject(MenuModelRegistry) protected readonly menus: MenuModelRegistry,
        @inject(KeybindingRegistry) protected readonly keybindings: KeybindingRegistry,
        @inject(ILogger) protected readonly logger: ILogger,
        @inject(ShellLayoutRestorer) protected readonly layoutRestorer: ShellLayoutRestorer,
        @inject(ContributionProvider) @named(FrontendApplicationContribution)
        protected readonly contributions: ContributionProvider<FrontendApplicationContribution>,
        @inject(ApplicationShell) protected readonly _shell: ApplicationShell,
    ) { }

    get shell(): ApplicationShell {
        return this._shell;
    }

    /**
     * Start the frontend application.
     *
     * Start up consists of the following steps:
     * - create the application shell
     * - start frontend contributions
     * - display the application shell
     */
    async start(): Promise<void> {
        this.startContributions();
        await this.layoutRestorer.initializeLayout(this, this.contributions.getContributions());
        this.ensureLoaded().then(() =>
            this.attachShell()
        );
    }

    protected attachShell(): void {
        const host = this.getHost();
        Widget.attach(this.shell, host);
        window.addEventListener('resize', () => this.shell.update());
        document.addEventListener('keydown', event => this.keybindings.run(event), true);
    }

    protected getHost(): HTMLElement {
        return document.body;
    }

    protected ensureLoaded(): Promise<void> {
        if (document.body) {
            return Promise.resolve();
        }
        return new Promise<void>(resolve =>
            window.onload = () => resolve()
        );
    }

    protected async startContributions(): Promise<void> {

        for (const contribution of this.contributions.getContributions()) {
            if (contribution.initialize) {
                try {
                    contribution.initialize();
                } catch (err) {
                    this.logger.error(err.toString());
                }
            }
        }

        /**
         * FIXME:
         * - decouple commands & menus
         * - consider treat commands, keybindings and menus as frontend application contributions
         */
        this.commands.onStart();
        this.keybindings.onStart();
        this.menus.onStart();
        for (const contribution of this.contributions.getContributions()) {
            if (contribution.onStart) {
                try {
                    await contribution.onStart(this);
                } catch (err) {
                    this.logger.error(err.toString());
                }
            }
        }

        window.onunload = () => {
            this.layoutRestorer.storeLayout(this);
            for (const contribution of this.contributions.getContributions()) {
                if (contribution.onStop) {
                    try {
                        contribution.onStop(this);
                    } catch (err) {
                        this.logger.error(err.toString());
                    }
                }
            }
        };
    }

}
