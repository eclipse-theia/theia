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

import { DisposableCollection, Emitter, Event } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { JSONValue } from '@theia/core/shared/@lumino/coreutils';
import { PreferenceInspection, PreferenceScope, PreferenceService } from '@theia/core/lib/common/preferences';
import { AiConfigurationChange, AiConfigurationInspection, AiConfigurationService } from '../common/ai-configuration-service';
import { TrustAwarePreferenceReader } from './trust-aware-preference-reader';

/**
 * Prefix shared by all AI-related preference keys. Only changes to keys under this namespace are
 * surfaced through {@link AiConfigurationService.onDidChange}.
 */
const AI_PREFERENCE_PREFIX = 'ai-features.';

@injectable()
export class AiConfigurationServiceImpl implements AiConfigurationService {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(TrustAwarePreferenceReader)
    protected readonly trustAwareReader: TrustAwarePreferenceReader;

    protected readonly toDispose = new DisposableCollection();

    protected readonly onDidChangeEmitter = new Emitter<AiConfigurationChange>();
    readonly onDidChange: Event<AiConfigurationChange> = this.onDidChangeEmitter.event;

    protected _ready: Promise<void>;
    get ready(): Promise<void> {
        return this._ready;
    }

    @postConstruct()
    protected init(): void {
        this._ready = Promise.all([this.preferenceService.ready, this.trustAwareReader.ready]).then(() => undefined);
        this.toDispose.push(this.onDidChangeEmitter);
        this.toDispose.push(
            this.preferenceService.onPreferenceChanged(change => {
                if (change.preferenceName.startsWith(AI_PREFERENCE_PREFIX)) {
                    this.onDidChangeEmitter.fire({
                        preferenceName: change.preferenceName,
                        affects: resourceUri => change.affects(resourceUri),
                        affectsPreference: preferenceName => preferenceName === change.preferenceName
                    });
                }
            })
        );
        this.toDispose.push(
            // A trust transition can change the effective value of any trust-gated key. Emit a
            // single change with no `preferenceName` and a sentinel `affects()` so listeners
            // re-query, mirroring how trust-aware services already react to trust changes.
            this.trustAwareReader.onDidChangeTrust(() => this.onDidChangeEmitter.fire({
                preferenceName: undefined,
                affects: () => true,
                affectsPreference: () => true
            }))
        );
    }

    get<T>(key: string, defaultValue?: T, resourceUri?: string): T | undefined {
        return this.trustAwareReader.get<T>(key, defaultValue, resourceUri);
    }

    set(key: string, value: unknown, scope: PreferenceScope, resourceUri?: string): Promise<void> {
        return this.preferenceService.set(key, value, scope, resourceUri);
    }

    update(key: string, value: unknown, resourceUri?: string): Promise<void> {
        return this.preferenceService.updateValue(key, value, resourceUri);
    }

    inspect<T extends JSONValue>(key: string, resourceUri?: string): AiConfigurationInspection<T> | undefined {
        const inspection = this.preferenceService.inspect<T>(key, resourceUri);
        if (!inspection) {
            return undefined;
        }
        return this.enrichInspection(inspection);
    }

    /**
     * Derives the trust-aware {@link AiConfigurationInspection.sourceScope} and effective `value`
     * from a raw {@link PreferenceInspection}. The workspace-trust rule is applied once, via
     * {@link TrustAwarePreferenceReader.suppressUntrusted} (the single owner of that rule): when
     * untrusted, folder and workspace scope values are cleared, so the scope walk below naturally
     * resolves to the user/default scope and the whole inspection stays consistent with {@link get}.
     *
     * Note: `value` reflects the narrowest defined scope, matching `PreferenceService.inspect`. For
     * object-valued preferences this can differ from {@link get}, which deep-merges across scopes.
     */
    protected enrichInspection<T extends JSONValue>(inspection: PreferenceInspection<T>): AiConfigurationInspection<T> {
        const suppressed = this.trustAwareReader.suppressUntrusted(inspection);
        if (suppressed.workspaceFolderValue !== undefined) {
            return { ...suppressed, sourceScope: PreferenceScope.Folder, value: suppressed.workspaceFolderValue };
        }
        if (suppressed.workspaceValue !== undefined) {
            return { ...suppressed, sourceScope: PreferenceScope.Workspace, value: suppressed.workspaceValue };
        }
        if (suppressed.globalValue !== undefined) {
            return { ...suppressed, sourceScope: PreferenceScope.User, value: suppressed.globalValue };
        }
        return { ...suppressed, sourceScope: undefined, value: suppressed.defaultValue };
    }
}
