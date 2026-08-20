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

import { Event } from '@theia/core';
import { JSONValue } from '@theia/core/shared/@lumino/coreutils';
import { PreferenceInspection, PreferenceScope } from '@theia/core/lib/common/preferences';

export const AiConfigurationService = Symbol('AiConfigurationService');

/**
 * A {@link PreferenceInspection} augmented with a derived, workspace-trust-aware source scope.
 */
export interface AiConfigurationInspection<T extends JSONValue = JSONValue> extends PreferenceInspection<T> {
    /**
     * The narrowest scope (honoring workspace trust) in which a value is explicitly set, i.e. the
     * scope that determines the effective {@link PreferenceInspection.value}. Walked in precedence
     * order `Folder -> Workspace -> User`; `undefined` when only the default value applies. In an
     * untrusted workspace the folder/workspace scopes are ignored, so `sourceScope` is either
     * `User` or `undefined`.
     */
    sourceScope?: PreferenceScope;
}

/**
 * Payload of {@link AiConfigurationService.onDidChange}.
 */
export interface AiConfigurationChange {
    /**
     * The preference key that changed. When the change is caused by a workspace-trust transition
     * (which can change the effective value of any trust-gated key) this is `undefined` and
     * {@link affects} returns `true` for every resource. Listeners tracking a specific key should
     * re-query the value when `preferenceName` is `undefined` or equals their key.
     */
    readonly preferenceName?: string;
    /**
     * Tests whether the given resource is affected by the change.
     * @param resourceUri the uri of the resource to test.
     */
    affects(resourceUri?: string): boolean;
    /**
     * Tests whether the given preference key is affected by this change, treating a workspace-trust
     * transition (where {@link preferenceName} is `undefined`) as affecting every trust-gated key.
     * Prefer this over comparing {@link preferenceName} directly so listeners do not silently miss
     * trust transitions.
     * @param preferenceName the preference key to test.
     */
    affectsPreference(preferenceName: string): boolean;
}

/**
 * Framework API for reading and writing AI-related (`ai-features.*`) preferences.
 *
 * `AiConfigurationService` wraps the core `PreferenceService` and is the intended extension point
 * for adopters and extensions that configure AI features: prefer it over talking to
 * `PreferenceService` directly for `ai-features.*` keys. Routing all AI configuration through this
 * seam keeps consumers insulated from future changes to how AI preferences are stored.
 *
 * Reads ({@link get}, {@link inspect}) are **workspace-trust-aware**: workspace and folder scope
 * values are suppressed while the workspace is untrusted (failing closed until the trust state
 * resolves), matching how AI features read preferences today. Writes ({@link set}, {@link update})
 * are never gated by trust.
 */
export interface AiConfigurationService {
    /**
     * Resolves once the underlying preference service and the initial workspace-trust state are
     * ready. Await this before the first read for a deterministic, trust-aware result.
     */
    readonly ready: Promise<void>;

    /**
     * Retrieves the effective, trust-aware value for the given preference.
     *
     * @param key the preference identifier.
     * @param defaultValue the value to return when no value is stored.
     * @param resourceUri the uri of the resource for which the preference is read.
     */
    get<T>(key: string, defaultValue?: T, resourceUri?: string): T | undefined;

    /**
     * Writes `value` to the given scope. Maps to `PreferenceService.set`.
     *
     * @param key the preference identifier.
     * @param value the new value (must be JSON-serializable). `undefined` clears the value in the given scope.
     * @param scope the scope to write to. For {@link PreferenceScope.Folder} a `resourceUri` is required.
     * @param resourceUri the uri of the resource for which the preference is stored.
     */
    set(key: string, value: unknown, scope: PreferenceScope, resourceUri?: string): Promise<void>;

    /**
     * "Smart write": picks the scope so that the effective value becomes `value`. Maps to
     * `PreferenceService.updateValue`.
     *
     * @param key the preference identifier.
     * @param value the value to apply (must be JSON-serializable). `undefined` resets the preference to its default value.
     * @param resourceUri the uri of the resource to which the change applies.
     */
    update(key: string, value: unknown, resourceUri?: string): Promise<void>;

    /**
     * Retrieves the per-scope values for the given preference, enriched with a derived,
     * trust-aware {@link AiConfigurationInspection.sourceScope} and effective
     * {@link PreferenceInspection.value}.
     *
     * @param key the preference identifier.
     * @param resourceUri the uri of the resource for which the preference is inspected.
     */
    inspect<T extends JSONValue>(key: string, resourceUri?: string): AiConfigurationInspection<T> | undefined;

    /**
     * Fires when a `ai-features.*` preference changes or when the workspace-trust state transitions
     * (which can change the effective value of trust-gated keys). The effective value is not carried
     * on the event; listeners re-query it via {@link get}/{@link inspect}.
     */
    onDidChange: Event<AiConfigurationChange>;
}
