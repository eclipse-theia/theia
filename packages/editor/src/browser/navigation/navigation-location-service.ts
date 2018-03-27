/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import { ILogger } from '@theia/core/lib/common/logger';
import { OpenerService, OpenerOptions, open } from '@theia/core/lib/browser/opener-service';
import { EditorOpenerOptions } from '../editor-manager';
import { NavigationLocationUpdater } from './navigation-location-updater';
import { NavigationLocationSimilarity } from './navigation-location-similarity';
import { NavigationLocation, Range } from './navigation-location';

/**
 * The navigation location service. Also, stores and manages navigation locations.
 */
@injectable()
export class NavigationLocationService {

    private static MAX_STACK_ITEMS = 30;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(NavigationLocationUpdater)
    protected readonly updater: NavigationLocationUpdater;

    @inject(NavigationLocationSimilarity)
    protected readonly similarity: NavigationLocationSimilarity;

    protected pointer = -1;
    protected stack: NavigationLocation[] = [];
    protected canRegister = true;

    /**
     * Registers the give locations into the service.
     */
    register(...locations: NavigationLocation[]): void {
        if (this.canRegister) {
            const max = this.maxStackItems();
            [...locations].forEach(location => {
                const current = this.currentLocation();
                this.debug(`Registering new location: ${NavigationLocation.toObject(location)}.`);
                if (!this.isSimilar(current, location)) {
                    this.debug(`Before location registration.`);
                    this.debug(this.stackDump);
                    // Just like in VSCode; if we are not at the end of stack, we remove anything after.
                    if (this.stack.length > this.pointer + 1) {
                        this.debug(`Discarding all locations after ${this.pointer}.`);
                        this.stack = this.stack.slice(0, this.pointer + 1);
                    }
                    this.stack.push(location);
                    this.pointer = this.stack.length - 1;
                    if (this.stack.length > max) {
                        this.debug(`Trimming exceeding locations.`);
                        this.stack.shift();
                        this.pointer--;
                    }
                    this.debug(`Updating preceeding navigation locations.`);
                    for (let i = this.stack.length - 1; i >= 0; i--) {
                        const candidate = this.stack[i];
                        const update = this.updater.affects(candidate, location);
                        if (update === undefined) {
                            this.debug(`Erasing obsolete location: ${NavigationLocation.toObject(candidate)}.`);
                            this.stack.splice(i, 1);
                            this.pointer--;
                        } else if (typeof update !== 'boolean') {
                            this.debug(`Updating location at index: ${i} => ${NavigationLocation.toObject(candidate)}.`);
                            this.stack[i] = update;
                        }
                    }
                    this.debug(`After location registration.`);
                    this.debug(this.stackDump);
                } else {
                    if (current) {
                        this.debug(`The new location ${NavigationLocation.toObject(location)} is similar to the current one: ${NavigationLocation.toObject(current)}. Aborting.`);
                    }
                }
            });
        }
    }

    /**
     * Navigates one back. Returns with the previous location, or `undefined` if it could not navigate back.
     */
    async back(): Promise<NavigationLocation | undefined> {
        this.debug('Navigating back.');
        if (this.canGoBack()) {
            this.pointer--;
            await this.reveal();
            this.debug(this.stackDump);
            return this.currentLocation();
        }
        this.debug('Cannot navigate back.');
        return undefined;
    }

    /**
     * Navigates one forward. Returns with the next location, or `undefined` if it could not go forward.
     */
    async forward(): Promise<NavigationLocation | undefined> {
        this.debug('Navigating forward.');
        if (this.canGoForward()) {
            this.pointer++;
            await this.reveal();
            this.debug(this.stackDump);
            return this.currentLocation();
        }
        this.debug('Cannot navigate forward.');
        return undefined;
    }

    /**
     * Checks whether the service can go [`back`](#back).
     */
    canGoBack(): boolean {
        return this.pointer >= 1;
    }

    /**
     * Checks whether the service can go [`forward`](#forward).
     */
    canGoForward(): boolean {
        return this.pointer >= 0 && this.pointer !== this.stack.length - 1;
    }

    /**
     * Returns with all known navigation locations in chronological order.
     */
    locations(): ReadonlyArray<NavigationLocation> {
        return this.stack;
    }

    /**
     * Returns with the current location.
     */
    currentLocation(): NavigationLocation | undefined {
        return this.stack[this.pointer];
    }

    /**
     * `true` if the two locations are similar.
     */
    protected isSimilar(left: NavigationLocation | undefined, right: NavigationLocation | undefined): boolean {
        return this.similarity.similar(left, right);
    }

    /**
     * Returns with the number of navigation locations that the application can handle and manage.
     * When the number of locations exceeds this number, old locations will be erased.
     */
    protected maxStackItems(): number {
        return NavigationLocationService.MAX_STACK_ITEMS;
    }

    /**
     * Reveals the location argument. If not given, reveals the `current location`. Does nothing, if the argument is `undefined`.
     */
    protected async reveal(location: NavigationLocation | undefined = this.currentLocation()): Promise<void> {
        if (location === undefined) {
            return;
        }
        try {
            this.canRegister = false;
            const { uri } = location;
            const options = this.toOpenerOptions(location);
            await open(this.openerService, uri, options);
        } catch (e) {
            this.logger.error(`Error occurred while revealing location: ${location}.`, e);
        } finally {
            this.canRegister = true;
        }
    }

    /**
     * Returns with the opener option for the location argument.
     */
    protected toOpenerOptions(location: NavigationLocation): OpenerOptions {
        const { start } = NavigationLocation.range(location);
        return {
            selection: Range.create(start, start)
        } as EditorOpenerOptions;
    }

    private async debug(message: string | (() => string)): Promise<void> {
        if (typeof message === 'string') {
            this.logger.debug(message);
        } else {
            if (await this.logger.isDebug()) {
                this.logger.debug(message());
            }
        }
    }

    private get stackDump(): string {
        return `----- Navigation location stack [${new Date()}] -----
Pointer: ${this.pointer}
${this.stack.map((location, i) => `${i}: ${JSON.stringify(NavigationLocation.toObject(location))}`).join('\n')}
----- o -----`;
    }

}
