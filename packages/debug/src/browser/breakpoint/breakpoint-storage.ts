/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { injectable, inject, postConstruct } from "inversify";
import { UserStorageService } from "@theia/userstorage/lib/browser";
import URI from "@theia/core/lib/common/uri";
import { ExtDebugProtocol } from "../../common/debug-common";
import { Deferred } from "@theia/core/lib/common/promise-util";
import { DebugUtils } from "../debug-utils";

@injectable()
export class BreakpointStorage {
    private readonly breakpoints = new Map<string, ExtDebugProtocol.AggregatedBreakpoint>();
    private readonly path = new URI().withPath("breakpoints");
    private readonly _ready = new Deferred<void>();

    constructor(@inject(UserStorageService) protected readonly storageService: UserStorageService) { }

    @postConstruct()
    protected init() {
        this.doLoad().then(breakpoints => {
            breakpoints.forEach(breakpoint => this.breakpoints.set(DebugUtils.makeBreakpointId(breakpoint), breakpoint));
            this._ready.resolve();
        }).catch(() => this._ready.resolve());
    }

    get ready(): Promise<void> {
        return this._ready.promise;
    }

    /**
     * Adds a new breakpoint. Throws an error if breakpoint already exists.
     * @param breakpoint the breakpoint to add
     */
    async add(breakpoint: ExtDebugProtocol.AggregatedBreakpoint): Promise<void> {
        await this.ready;

        const id = DebugUtils.makeBreakpointId(breakpoint);
        if (this.breakpoints.has(id)) {
            return Promise.reject(`Breakpoint '${id}' already exists.`);
        }

        this.breakpoints.set(id, breakpoint);
        return this.doSave(Array.from(this.breakpoints.values()));
    }

    /**
     * Updates existed breakpoint.
     * @param breakpoint the breakpoint to update
     */
    async update(breakpoint: ExtDebugProtocol.AggregatedBreakpoint): Promise<void> {
        await this.ready;

        const id = DebugUtils.makeBreakpointId(breakpoint);
        if (this.breakpoints.has(id)) {
            this.breakpoints.set(id, breakpoint);
            return this.doSave(Array.from(this.breakpoints.values()));
        }
    }

    /**
     * Updates existed breakpoints.
     * @param breakpoint the breakpoint to update
     */
    async updateAll(breakpoints: ExtDebugProtocol.AggregatedBreakpoint[]): Promise<void> {
        await this.ready;

        breakpoints.forEach(breakpoint => {
            const id = DebugUtils.makeBreakpointId(breakpoint);
            if (this.breakpoints.has(id)) {
                this.breakpoints.set(id, breakpoint);
            }
        });

        return this.doSave(Array.from(this.breakpoints.values()));
    }

    /**
     * Deletes given breakpoint.
     * @param breakpoint the breakpoint to delete
     */
    async delete(breakpoint: ExtDebugProtocol.AggregatedBreakpoint): Promise<void> {
        await this.ready;

        this.breakpoints.delete(DebugUtils.makeBreakpointId(breakpoint));
        return this.doSave(Array.from(this.breakpoints.values()));
    }

    /**
     * Gets breakpoints by given criteria.
     * @param filter the filter
     * @returns the list of breakpoints
     */
    async get(filter?: (breakpoint: ExtDebugProtocol.AggregatedBreakpoint) => boolean): Promise<ExtDebugProtocol.AggregatedBreakpoint[]> {
        await this.ready;

        if (filter) {
            return Array.from(this.breakpoints.values()).filter(filter);
        } else {
            return Array.from(this.breakpoints.values());
        }
    }

    /**
     * Indicates if breakpoint with given id exists.
     * @param id the breakpoint id
     * @returns true if breakpoint exists and false otherwise
     */
    async exists(id: string): Promise<boolean> {
        await this.ready;
        return this.breakpoints.has(id);
    }

    protected async doSave(breakpoints: ExtDebugProtocol.AggregatedBreakpoint[]): Promise<void> {
        return this.storageService.saveContents(this.path, JSON.stringify(breakpoints));
    }

    protected async doLoad(): Promise<ExtDebugProtocol.AggregatedBreakpoint[]> {
        return this.storageService.readContents(this.path)
            .then(content => {
                if (content.length === 0) {
                    return [];
                }

                try {
                    return JSON.parse(content);
                } catch (error) {
                    return Promise.reject('It is impossible to parse the list of breakpoints: ' + (error.message || error));
                }
            });
    }
}
