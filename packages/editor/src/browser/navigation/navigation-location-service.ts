/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core/lib/common/logger';
import { OpenerService, OpenerOptions, open } from '@theia/core/lib/browser/opener-service';
import { EditorOpenerOptions } from '../editor-manager';
import { NavigationLocationUpdater } from './navigation-location-updater';
import { NavigationLocationSimilarity } from './navigation-location-similarity';
import { NavigationLocation, Range, ContentChangeLocation } from './navigation-location';

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
    protected _lastEditLocation: ContentChangeLocation | undefined;

    /**
     * Registers the give locations into the service.
     */
    register(...locations: NavigationLocation[]): void {
        if (this.canRegister) {
            const max = this.maxStackItems();
            [...locations].forEach(location => {
                if (ContentChangeLocation.is(location)) {
                    this._lastEditLocation = location;
                }
                const current = this.currentLocation();
                this.debug(`Registering new location: ${NavigationLocation.toString(location)}.`);
                if (!this.isSimilar(current, location)) {
                    this.debug('Before location registration.');
                    this.debug(this.stackDump);
                    // Just like in VSCode; if we are not at the end of stack, we remove anything after.
                    if (this.stack.length > this.pointer + 1) {
                        this.debug(`Discarding all locations after ${this.pointer}.`);
                        this.stack = this.stack.slice(0, this.pointer + 1);
                    }
                    this.stack.push(location);
                    this.pointer = this.stack.length - 1;
                    if (this.stack.length > max) {
                        this.debug('Trimming exceeding locations.');
                        this.stack.shift();
                        this.pointer--;
                    }
                    this.debug('Updating preceding navigation locations.');
                    for (let i = this.stack.length - 1; i >= 0; i--) {
                        const candidate = this.stack[i];
                        const update = this.updater.affects(candidate, location);
                        if (update === undefined) {
                            this.debug(`Erasing obsolete location: ${NavigationLocation.toString(candidate)}.`);
                            this.stack.splice(i, 1);
                            this.pointer--;
                        } else if (typeof update !== 'boolean') {
                            this.debug(`Updating location at index: ${i} => ${NavigationLocation.toString(candidate)}.`);
                            this.stack[i] = update;
                        }
                    }
                    this.debug('After location registration.');
                    this.debug(this.stackDump);
                } else {
                    if (current) {
                        this.debug(`The new location ${NavigationLocation.toString(location)} is similar to the current one: ${NavigationLocation.toString(current)}. Aborting.`);
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
     * Returns with the location of the most recent edition if any. If there were no modifications,
     * returns `undefined`.
     */
    lastEditLocation(): NavigationLocation | undefined {
        return this._lastEditLocation;
    }

    /**
     * Clears the navigation history.
     */
    clearHistory(): void {
        this.stack = [];
        this.pointer = -1;
        this._lastEditLocation = undefined;
    }

    /**
     * Reveals the location argument. If not given, reveals the `current location`. Does nothing, if the argument is `undefined`.
     */
    async reveal(location: NavigationLocation | undefined = this.currentLocation()): Promise<void> {
        if (location === undefined) {
            return;
        }
        try {
            this.canRegister = false;
            const { uri } = location;
            const options = this.toOpenerOptions(location);
            await open(this.openerService, uri, options);
        } catch (e) {
            this.logger.error(`Error occurred while revealing location: ${NavigationLocation.toString(location)}.`, e);
        } finally {
            this.canRegister = true;
        }
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
     * Returns with the opener option for the location argument.
     */
    protected toOpenerOptions(location: NavigationLocation): OpenerOptions {
        let { start } = NavigationLocation.range(location);
        // Here, the `start` and represents the previous state that has been updated with the `text`.
        // So we calculate the range by appending the `text` length to the `start`.
        if (ContentChangeLocation.is(location)) {
            start = { ...start, character: start.character + location.context.text.length };
        }
        return {
            selection: Range.create(start, start)
        } as EditorOpenerOptions;
    }

    private async debug(message: string | (() => string)): Promise<void> {
        this.logger.trace(typeof message === 'string' ? message : message());
    }

    private get stackDump(): string {
        return `----- Navigation location stack [${new Date()}] -----
Pointer: ${this.pointer}
${this.stack.map((location, i) => `${i}: ${JSON.stringify(NavigationLocation.toObject(location))}`).join('\n')}
----- o -----`;
    }

}
