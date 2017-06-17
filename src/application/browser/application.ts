/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'reflect-metadata';
import { inject, injectable, named } from 'inversify';
import {
    ContributionProvider,
    CommandRegistry, KeybindingRegistry, MenuModelRegistry,
    MaybePromise, Disposable, DisposableCollection
} from '../common';
import { ApplicationShell } from './shell';
import { Widget } from "./widgets";

/**
 * The frontend application contribution is an entry point for frontend extensions.
 */
export const FrontendApplicationContribution = Symbol("FrontendApplicationContribution");
export interface FrontendApplicationContribution {
    /**
     * Activate this extension.
     *
     * Return a disposable to deactivate this extension.
     */
    activate?(app: FrontendApplication): MaybePromise<Disposable>;
}

export interface FrontendApplicationStartOptions {
    host: HTMLElement
}
export const defaultFrontendApplicationStartOptions: FrontendApplicationStartOptions = {
    host: document.body
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
     * - activate frontend extensions
     * - display the application shell
     *
     * Return a disposable to stop the frontend applicaiton.
     * Reject if the application is already running.
     */
    async start(
        options: FrontendApplicationStartOptions = defaultFrontendApplicationStartOptions
    ): Promise<Disposable> {
        const toDispose = new DisposableCollection();
        toDispose.push(this.createShell());
        toDispose.push(await this.activateExtensions());
        toDispose.push(this.attachShell(options));
        return toDispose;
    }

    protected createShell(): Disposable {
        if (this._shell) {
            throw new Error('The application is already running.');
        }
        /**
         * Fixme: use the application shell factory to create an instance
         */
        this._shell = new ApplicationShell();

        const toDispose = new DisposableCollection();
        toDispose.push(this._shell);
        toDispose.push(Disposable.create(() =>
            this._shell = undefined
        ));
        return toDispose;
    }

    protected attachShell(options: FrontendApplicationStartOptions): Disposable {
        Widget.attach(this.shell, options.host);
        const listener = () => this.shell.update();
        window.addEventListener('resize', listener);
        return Disposable.create(() => {
            Widget.detach(this.shell);
            window.removeEventListener('resize', listener);
        });
    }

    protected async activateExtensions(): Promise<Disposable> {
        const toDispose = new DisposableCollection();
        /**
         * FIXME:
         * - decouple commands & menus
         * - consider treat commands, keybindings and menus as frontend application contributions
         */
        toDispose.push(this.commands.activate());
        toDispose.push(this.keybindings.activate());
        toDispose.push(this.menus.activate());

        const toActivate: Promise<Disposable>[] = [];
        for (const contribution of this.contributions.getContributions()) {
            if (contribution.activate) {
                toActivate.push(Promise.resolve(contribution.activate(this)));
            }
        }
        toDispose.pushAll(await Promise.all(toActivate));
        return toDispose;
    }

}
