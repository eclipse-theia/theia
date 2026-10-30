// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Emitter, Event } from '@theia/core';
import { injectable, unmanaged } from '@theia/core/shared/inversify';
import { TerminalWidget } from './base/terminal-widget';
import { ShellTerminalProfile } from './shell-terminal-profile';

export const TerminalProfileService = Symbol('TerminalProfileService');
export const ContributedTerminalProfileStore = Symbol('ContributedTerminalProfileStore');
export const UserTerminalProfileStore = Symbol('UserTerminalProfileStore');

export interface TerminalProfile {
    /**
     * A human-readable name to present the profile to the user. Defaults to the ID of the profile.
     */
    readonly label?: string;
    start(): Promise<TerminalWidget>;
}

export const NULL_PROFILE: TerminalProfile = {
    start: async () => { throw new Error('you cannot start a null profile'); }
};

export interface TerminalProfileService {
    onAdded: Event<string>;
    onRemoved: Event<string>;
    getProfile(id: string): TerminalProfile | undefined
    readonly all: [string, TerminalProfile][];
    setDefaultProfile(id: string): void;
    readonly onDidChangeDefaultShell: Event<string>;
    readonly defaultProfile: TerminalProfile | undefined;
}

export interface TerminalProfileStore {
    onAdded: Event<[string, TerminalProfile]>;
    onRemoved: Event<string>;
    registerTerminalProfile(id: string, profile: TerminalProfile): void;
    unregisterTerminalProfile(id: string): void;
    hasProfile(id: string): boolean;
    getProfile(id: string): TerminalProfile | undefined
    readonly all: [string, TerminalProfile][];
}

@injectable()
export class DefaultProfileStore implements TerminalProfileStore {
    protected readonly onAddedEmitter: Emitter<[string, TerminalProfile]> = new Emitter();
    protected readonly onRemovedEmitter: Emitter<string> = new Emitter();
    protected readonly profiles: Map<string, TerminalProfile> = new Map();

    onAdded: Event<[string, TerminalProfile]> = this.onAddedEmitter.event;
    onRemoved: Event<string> = this.onRemovedEmitter.event;

    registerTerminalProfile(id: string, profile: TerminalProfile): void {
        this.profiles.set(id, profile);
        this.onAddedEmitter.fire([id, profile]);
    }
    unregisterTerminalProfile(id: string): void {
        this.profiles.delete(id);
        this.onRemovedEmitter.fire(id);
    }

    hasProfile(id: string): boolean {
        return this.profiles.has(id);
    }

    getProfile(id: string): TerminalProfile | undefined {
        return this.profiles.get(id);
    }
    get all(): [string, TerminalProfile][] {
        return [...this.profiles.entries()];
    }
}

@injectable()
export class DefaultTerminalProfileService implements TerminalProfileService {
    /** The ID of the default profile. The first profile is the default if it is not set or not available. */
    protected defaultProfileId: string | undefined;
    protected order: string[] = [];
    protected readonly stores: TerminalProfileStore[];

    protected readonly onAddedEmitter: Emitter<string> = new Emitter();
    protected readonly onRemovedEmitter: Emitter<string> = new Emitter();
    protected readonly onDidChangeDefaultShellEmitter: Emitter<string> = new Emitter();

    onAdded: Event<string> = this.onAddedEmitter.event;
    onRemoved: Event<string> = this.onRemovedEmitter.event;
    onDidChangeDefaultShell: Event<string> = this.onDidChangeDefaultShellEmitter.event;

    constructor(@unmanaged() ...stores: TerminalProfileStore[]) {
        this.stores = stores;
        for (const store of this.stores) {
            store.onAdded(e => {
                if (e[1] === NULL_PROFILE) {
                    this.handleRemoved(e[0]);
                } else {
                    this.handleAdded(e[0]);
                }
            });
            store.onRemoved(id => {
                if (!this.getProfile(id)) {
                    this.handleRemoved(id);
                } else {
                    // we may have removed a null profile
                    this.handleAdded(id);
                }
            });
        }
    }

    handleRemoved(id: string): void {
        const index = this.order.indexOf(id);
        if (index >= 0 && !this.getProfile(id)) {
            // the profile was removed, but it's still in the `order` array
            this.order.splice(index, 1);
            this.onRemovedEmitter.fire(id);
            if (id === this.defaultProfileId) {
                this.fireDefaultShellChanged();
            }
        }
    }

    handleAdded(id: string): void {
        const index = this.order.indexOf(id);
        if (index < 0) {
            this.order.push(id);
            this.onAddedEmitter.fire(id);
            if (id === this.defaultProfileId) {
                this.fireDefaultShellChanged();
            }
        }
    }

    get defaultProfile(): TerminalProfile | undefined {
        const defaultProfile = this.defaultProfileId !== undefined ? this.getProfile(this.defaultProfileId) : undefined;
        if (defaultProfile) {
            return defaultProfile;
        }
        const firstId = this.order[0];
        return firstId !== undefined ? this.getProfile(firstId) : undefined;
    }

    setDefaultProfile(id: string): void {
        if (!this.getProfile(id)) {
            throw new Error(`Cannot set default to unknown profile '${id}' `);
        }
        this.defaultProfileId = id;
        this.fireDefaultShellChanged();
    }

    protected fireDefaultShellChanged(): void {
        const profile = this.defaultProfile;
        this.onDidChangeDefaultShellEmitter.fire(profile instanceof ShellTerminalProfile && profile.shellPath ? profile.shellPath : '');
    }

    getProfile(id: string): TerminalProfile | undefined {
        for (const store of this.stores) {
            if (store.hasProfile(id)) {
                const found = store.getProfile(id);
                return found === NULL_PROFILE ? undefined : found;
            }
        }
        return undefined;
    }

    getId(profile: TerminalProfile): string | undefined {
        for (const [id, p] of this.all) {
            if (p === profile) {
                return id;
            }
        }
    }

    get all(): [string, TerminalProfile][] {
        return this.order.filter(id => !!this.getProfile(id)).map(id => [id, this.getProfile(id)!]);
    }
}
