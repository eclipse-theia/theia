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
import { injectable } from '@theia/core/shared/inversify';
import { TerminalWidget } from './base/terminal-widget';
import { ShellTerminalProfile } from './shell-terminal-profile';

export const TerminalProfileService = Symbol('TerminalProfileService');
export const ContributedTerminalProfileStore = Symbol('ContributedTerminalProfileStore');
export const UserTerminalProfileStore = Symbol('UserTerminalProfileStore');

export interface TerminalProfile {
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
    protected defaultProfileIndex = 0;
    protected order: string[] = [];
    protected readonly stores: TerminalProfileStore[];

    protected readonly onAddedEmitter: Emitter<string> = new Emitter();
    protected readonly onRemovedEmitter: Emitter<string> = new Emitter();
    protected readonly onDidChangeDefaultShellEmitter: Emitter<string> = new Emitter();

    onAdded: Event<string> = this.onAddedEmitter.event;
    onRemoved: Event<string> = this.onRemovedEmitter.event;
    onDidChangeDefaultShell: Event<string> = this.onDidChangeDefaultShellEmitter.event;

    constructor(...stores: TerminalProfileStore[]) {
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
            this.defaultProfileIndex = Math.max(0, Math.min(this.order.length - 1, index));
            this.onRemovedEmitter.fire(id);
        }
    }

    handleAdded(id: string): void {
        const index = this.order.indexOf(id);
        if (index < 0) {
            this.order.push(id);
            this.onAddedEmitter.fire(id);
        }
    }

    get defaultProfile(): TerminalProfile | undefined {
        const id = this.order[this.defaultProfileIndex];
        if (id) {
            return this.getProfile(id);
        }
        return undefined;
    }

    setDefaultProfile(id: string): void {
        const profile = this.getProfile(id);
        if (!profile) {
            throw new Error(`Cannot set default to unknown profile '${id}' `);
        }
        this.defaultProfileIndex = this.order.indexOf(id);

        if (profile instanceof ShellTerminalProfile && profile.shellPath) {
            this.onDidChangeDefaultShellEmitter.fire(profile.shellPath);
        } else {
            this.onDidChangeDefaultShellEmitter.fire('');
        }
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
