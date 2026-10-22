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

/**
 * Provider-level state of dynamic model discovery.
 *
 * This is distinct from the per-model {@link LanguageModelStatus} (`ready`/`unavailable`):
 * it describes whether a provider's list of models is currently being fetched, has failed,
 * needs credentials or user consent, etc. It gives the UI a place to communicate fetching
 * progress and error state for the whole provider.
 */
export type ModelDiscoveryState =
    /** No credential (API key / host) is configured, so nothing can be fetched. */
    | 'no-credentials'
    /** A credential was found in the environment and awaits the user's one-time confirmation. */
    | 'awaiting-consent'
    /** Nothing in progress; no fetch has run yet. */
    | 'idle'
    /** A fetch is currently in flight. */
    | 'fetching'
    /** The last fetch (or cache load) succeeded and models are registered. */
    | 'ready'
    /** The last fetch failed. */
    | 'error'
    /** The model list is configured manually, so the provider is not asked what it offers. */
    | 'overridden';

/** Where a provider's effective API key comes from. Used to gate env-var keys behind a one-time consent. */
export type ApiKeySource = 'preference' | 'environment' | 'none';

/**
 * A model a provider reported from its list endpoint.
 *
 * Only {@link id} is guaranteed: the endpoints differ widely in what they report about a model.
 * Anthropic gives a display name and a release date, Google additionally a description, and
 * OpenAI nothing but the id.
 */
export interface DiscoveredModel {
    /** Provider-native model id, without the `<provider>/` prefix. */
    readonly id: string;
    /** Human-readable name reported by the provider, e.g. `Claude Opus 5`. */
    readonly label?: string;
    /** Longer description reported by the provider. */
    readonly description?: string;
    /** Release date (ms since epoch) reported by the provider, used to order dated variants. */
    readonly released?: number;
    /**
     * Set by a provider that knows better than the generic ranking which of its models should be
     * offered in the model pickers without the user asking. GitHub Copilot serves several vendors, so
     * "the five newest" would offer five models of whichever vendor names its models with the highest
     * numbers; it therefore nominates one per vendor itself. Left unset by the other providers.
     */
    readonly featured?: boolean;
}

/**
 * Result of a provider model-discovery attempt.
 *
 * On a successful live fetch, `fromCache` is `false`. When the live fetch fails but a cached
 * snapshot is available, the cached models are returned with `fromCache: true` and `error` set to
 * the failure reason, so the UI can keep the models usable while indicating they may be stale.
 */
export interface ModelDiscoveryResult {
    /** The discovered models, in the order they should be registered. */
    readonly models: DiscoveredModel[];
    /** Whether the models came from the cached snapshot because the live fetch failed. */
    readonly fromCache: boolean;
    /** Failure reason when the live fetch failed (even if a cached result was returned). */
    readonly error?: string;
}

/**
 * What to do about a discovery state, offered as a button next to the explanation.
 *
 * Most providers need none: what a missing credential wants is the API key setting, which sits on the
 * same page right above. A provider whose credential is established by a command rather than a
 * preference — GitHub Copilot signs in through its CLI — names that command here.
 */
export interface ModelDiscoveryAction {
    /** Button label, already localized. */
    readonly label: string;
    readonly commandId: string;
    readonly args?: unknown[];
}

/**
 * Snapshot of a provider's model-discovery state, as observed on the frontend.
 */
export interface ModelDiscoveryStatus {
    /** Provider id, e.g. `anthropic`. Matches the provider node in the Models configuration category. */
    readonly providerId: string;
    /** Human-readable provider label, e.g. `Anthropic`. */
    readonly label: string;
    /**
     * Prefix used for this provider's registered model ids (e.g. `openai` while the provider id is
     * `openAiOfficial`). Defaults to {@link providerId} when omitted.
     */
    readonly modelIdPrefix?: string;
    readonly state: ModelDiscoveryState;
    /**
     * Overrides the badge label the state would otherwise carry, for a provider the generic wording
     * does not fit: what GitHub Copilot lacks when it has no credential is a sign-in, not an API key.
     */
    readonly stateLabel?: string;
    /** Optional human-readable detail (error message, hint). */
    readonly message?: string;
    /** Timestamp (ms since epoch) of the last successful fetch, if any. */
    readonly lastFetch?: number;
    /** Whether the currently registered models came from a cached snapshot rather than a live fetch. */
    readonly fromCache?: boolean;
    /**
     * What the provider reported about the models it discovered, keyed by id in
     * {@link DiscoveredModel.id}. The registry stays the source of truth for which models are
     * registered; this only carries the extra metadata (label, description) for display.
     */
    readonly discovered?: readonly DiscoveredModel[];
    /** What the user can do about the current state, where a command settles it. */
    readonly action?: ModelDiscoveryAction;
}
