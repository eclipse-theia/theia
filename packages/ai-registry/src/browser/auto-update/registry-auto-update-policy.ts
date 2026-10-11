// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { PreferenceScope, PreferenceService } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import {
    AUTO_UPDATE_OVERRIDES_PREF,
    AUTO_UPDATE_PREF,
    AutoUpdateMode,
    RegistryArtifactKind
} from '../../common/ai-registry-preferences';

type Overrides = Record<string, AutoUpdateMode>;

export const RegistryAutoUpdatePolicy = Symbol('RegistryAutoUpdatePolicy');

/**
 * Resolves the effective auto-update mode for a registry artifact and maintains the
 * per-artifact override map.
 *
 * An artifact without an override follows the global default. Setting an artifact to the value
 * that currently *is* the default removes its override rather than writing a redundant one, so
 * the artifact keeps following the default if the user later changes it. An artifact therefore
 * cannot be pinned to the current default value; that is intentional, and it is what lets the
 * gear menu show whether a mode is inherited or explicitly set.
 */
export interface RegistryAutoUpdatePolicy {
    /** Override key for an artifact, e.g. `skill:my-skill-id` or `mcp:io.github.foo/bar`. */
    key(kind: RegistryArtifactKind, id: string): string;
    /** The configured default, or `ask` while none has been chosen. */
    getDefault(): AutoUpdateMode;
    /**
     * True once the user has explicitly chosen a default, as opposed to inheriting the schema
     * default. Gates the one-time "should this happen automatically?" prompt.
     */
    hasExplicitDefault(): boolean;
    setDefault(mode: AutoUpdateMode): Promise<void>;
    /** The effective mode for an artifact: its override if it has one, the default otherwise. */
    getMode(kind: RegistryArtifactKind, id: string | undefined): AutoUpdateMode;
    /** Writes the artifact's override, or removes it when `mode` equals the current default. */
    setMode(kind: RegistryArtifactKind, id: string, mode: AutoUpdateMode): Promise<void>;
    /** Drops the artifact's override, if it has one. */
    clearMode(kind: RegistryArtifactKind, id: string): Promise<void>;
}

@injectable()
export class RegistryAutoUpdatePolicyImpl implements RegistryAutoUpdatePolicy {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    key(kind: RegistryArtifactKind, id: string): string {
        return `${kind}:${id}`;
    }

    getDefault(): AutoUpdateMode {
        const value = this.preferenceService.get<string>(AUTO_UPDATE_PREF, 'ask');
        return AutoUpdateMode.is(value) ? value : 'ask';
    }

    hasExplicitDefault(): boolean {
        return this.preferenceService.inspect<string>(AUTO_UPDATE_PREF)?.globalValue !== undefined;
    }

    async setDefault(mode: AutoUpdateMode): Promise<void> {
        await this.preferenceService.set(AUTO_UPDATE_PREF, mode, PreferenceScope.User);
    }

    getMode(kind: RegistryArtifactKind, id: string | undefined): AutoUpdateMode {
        if (id === undefined) {
            return this.getDefault();
        }
        const override = this.readOverrides()[this.key(kind, id)];
        return AutoUpdateMode.is(override) ? override : this.getDefault();
    }

    async setMode(kind: RegistryArtifactKind, id: string, mode: AutoUpdateMode): Promise<void> {
        if (mode === this.getDefault()) {
            return this.clearMode(kind, id);
        }
        const overrides = this.readOverrides();
        const key = this.key(kind, id);
        if (overrides[key] === mode) {
            return;
        }
        await this.preferenceService.set(AUTO_UPDATE_OVERRIDES_PREF, { ...overrides, [key]: mode }, PreferenceScope.User);
    }

    async clearMode(kind: RegistryArtifactKind, id: string): Promise<void> {
        const overrides = this.readOverrides();
        const key = this.key(kind, id);
        if (!(key in overrides)) {
            return;
        }
        const next: Overrides = { ...overrides };
        delete next[key];
        await this.preferenceService.set(AUTO_UPDATE_OVERRIDES_PREF, next, PreferenceScope.User);
    }

    protected readOverrides(): Overrides {
        return this.preferenceService.get<Overrides>(AUTO_UPDATE_OVERRIDES_PREF, {}) ?? {};
    }
}
