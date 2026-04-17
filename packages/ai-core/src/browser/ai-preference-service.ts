// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { DisposableCollection, Emitter } from '@theia/core';
import {
    PreferenceChange,
    PreferenceChangeImpl,
    PreferenceChanges,
    PreferenceInspection,
    PreferenceService
} from '@theia/core/lib/common/preferences/preference-service';
import { PreferenceScope } from '@theia/core/lib/common/preferences/preference-scope';
import { OverridePreferenceName } from '@theia/core/lib/common/preferences/preference-language-override-service';
import { PreferenceResolveResult } from '@theia/core/lib/common/preferences/preference-provider';
import { PreferenceSchemaService } from '@theia/core/lib/common/preferences/preference-schema';
import { JSONValue } from '@theia/core/shared/@lumino/coreutils';
import URI from '@theia/core/lib/common/uri';
import { WorkspaceTrustService } from '@theia/workspace/lib/browser/workspace-trust-service';

export const AIPreferenceService = Symbol('AIPreferenceService');
export type AIPreferenceService = PreferenceService;

/**
 * A trust-aware wrapper around `PreferenceService` for AI packages.
 *
 * When the workspace is untrusted, reads ignore workspace- and folder-scoped
 * preference values, returning only user/global or default values. This prevents
 * a malicious `.theia/settings.json` from influencing AI behavior.
 *
 * All write operations delegate directly to the underlying `PreferenceService`.
 * Change events from the delegate are forwarded. Additionally, when workspace
 * trust flips, synthetic change events are fired for every preference whose
 * effective value changes as a result.
 */
@injectable()
export class AIPreferenceServiceImpl implements PreferenceService {

    @inject(PreferenceService)
    protected readonly delegate: PreferenceService;

    @inject(WorkspaceTrustService)
    protected readonly workspaceTrustService: WorkspaceTrustService;

    @inject(PreferenceSchemaService)
    protected readonly schemaService: PreferenceSchemaService;

    protected trusted = false;

    protected readonly onPreferenceChangedEmitter = new Emitter<PreferenceChange>();
    readonly onPreferenceChanged = this.onPreferenceChangedEmitter.event;

    protected readonly onPreferencesChangedEmitter = new Emitter<PreferenceChanges>();
    readonly onPreferencesChanged = this.onPreferencesChangedEmitter.event;

    protected readonly toDispose = new DisposableCollection(
        this.onPreferenceChangedEmitter,
        this.onPreferencesChangedEmitter
    );

    @postConstruct()
    protected init(): void {
        this.workspaceTrustService.getWorkspaceTrust().then(trusted => {
            this.trusted = trusted;
        });
        this.toDispose.push(
            this.workspaceTrustService.onDidChangeWorkspaceTrust(trusted => {
                this.handleTrustChange(trusted);
            })
        );
        this.toDispose.push(
            this.delegate.onPreferenceChanged(change => {
                this.onPreferenceChangedEmitter.fire(change);
            })
        );
        this.toDispose.push(
            this.delegate.onPreferencesChanged(changes => {
                this.onPreferencesChangedEmitter.fire(changes);
            })
        );
    }

    protected handleTrustChange(trusted: boolean): void {
        const previousTrust = this.trusted;
        this.trusted = trusted;
        if (previousTrust === trusted) {
            return;
        }
        const changes: PreferenceChanges = {};
        for (const preferenceName of this.schemaService.getSchemaProperties().keys()) {
            const inspection = this.delegate.inspect<JSONValue>(preferenceName);
            if (!inspection) {
                continue;
            }
            // Only preferences whose effective value is influenced by workspace/folder scope
            // can change as a result of a trust flip.
            if (inspection.workspaceValue === undefined && inspection.workspaceFolderValue === undefined) {
                continue;
            }
            const trustedValue = inspection.value;
            const untrustedValue = inspection.globalValue ?? inspection.defaultValue;
            const newValue = trusted ? trustedValue : untrustedValue;
            const oldValue = trusted ? untrustedValue : trustedValue;
            if (newValue === oldValue) {
                continue;
            }
            changes[preferenceName] = new PreferenceChangeImpl({
                preferenceName,
                newValue,
                oldValue,
                scope: PreferenceScope.Workspace
            });
        }
        const changedPreferenceNames = Object.keys(changes);
        if (changedPreferenceNames.length === 0) {
            return;
        }
        this.onPreferencesChangedEmitter.fire(changes);
        for (const preferenceName of changedPreferenceNames) {
            this.onPreferenceChangedEmitter.fire(changes[preferenceName]);
        }
    }

    get ready(): Promise<void> {
        return this.delegate.ready;
    }

    get isReady(): boolean {
        return this.delegate.isReady;
    }

    dispose(): void {
        // Do not dispose the delegate; it is shared
        this.toDispose.dispose();
    }

    get<T>(preferenceName: string): T | undefined;
    get<T>(preferenceName: string, defaultValue: T): T;
    get<T>(preferenceName: string, defaultValue: T, resourceUri: string): T;
    get<T>(preferenceName: string, defaultValue?: T, resourceUri?: string): T | undefined;
    get<T>(preferenceName: string, defaultValue?: T, resourceUri?: string): T | undefined {
        if (this.trusted) {
            return this.delegate.get<T>(preferenceName, defaultValue, resourceUri);
        }
        return this.resolve<T>(preferenceName, defaultValue, resourceUri).value ?? defaultValue;
    }

    set(preferenceName: string, value: unknown, scope?: PreferenceScope, resourceUri?: string): Promise<void> {
        return this.delegate.set(preferenceName, value, scope, resourceUri);
    }

    updateValue(preferenceName: string, value: unknown, resourceUri?: string): Promise<void> {
        return this.delegate.updateValue(preferenceName, value, resourceUri);
    }

    inspect<T extends JSONValue>(preferenceName: string, resourceUri?: string, forceLanguageOverride?: boolean): PreferenceInspection<T> | undefined {
        const inspection = this.delegate.inspect<T>(preferenceName, resourceUri, forceLanguageOverride);
        if (!inspection || this.trusted) {
            return inspection;
        }
        const value = (inspection.globalValue ?? inspection.defaultValue) as T | undefined;
        return {
            preferenceName: inspection.preferenceName,
            defaultValue: inspection.defaultValue,
            globalValue: inspection.globalValue,
            workspaceValue: undefined,
            workspaceFolderValue: undefined,
            value
        };
    }

    inspectInScope<T extends JSONValue>(preferenceName: string, scope: PreferenceScope, resourceUri?: string, forceLanguageOverride?: boolean): T | undefined {
        if (!this.trusted && (scope === PreferenceScope.Workspace || scope === PreferenceScope.Folder)) {
            return undefined;
        }
        return this.delegate.inspectInScope<T>(preferenceName, scope, resourceUri, forceLanguageOverride);
    }

    overridePreferenceName(options: OverridePreferenceName): string {
        return this.delegate.overridePreferenceName(options);
    }

    overriddenPreferenceName(preferenceName: string): OverridePreferenceName | undefined {
        return this.delegate.overriddenPreferenceName(preferenceName);
    }

    resolve<T>(preferenceName: string, defaultValue?: T, resourceUri?: string): PreferenceResolveResult<T> {
        if (this.trusted) {
            return this.delegate.resolve<T>(preferenceName, defaultValue, resourceUri);
        }
        const inspection = this.inspect<JSONValue>(preferenceName, resourceUri);
        if (inspection && inspection.value !== undefined) {
            return { value: inspection.value as unknown as T };
        }
        const overridden = this.delegate.overriddenPreferenceName(preferenceName);
        if (overridden) {
            const baseInspection = this.inspect<JSONValue>(overridden.preferenceName, resourceUri);
            if (baseInspection && baseInspection.value !== undefined) {
                return { value: baseInspection.value as unknown as T };
            }
        }
        return { value: defaultValue };
    }

    getConfigUri(scope: PreferenceScope, resourceUri?: string, sectionName?: string): URI | undefined {
        return this.delegate.getConfigUri(scope, resourceUri, sectionName);
    }
}
