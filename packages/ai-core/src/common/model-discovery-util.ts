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

import { DiscoveredModel } from './model-discovery-status';

/**
 * Helpers for the dated model ids that provider list endpoints report. Providers call these from
 * an overridable method of their language-models manager, so a provider (or an adopter) can opt
 * out or refine the behaviour without reimplementing it.
 */
export namespace DiscoveredModels {

    /**
     * The date suffix providers append to a release-pinned id: `-20260401` and `-2026-04-01`, plus the
     * `-0613` (month and day only) form OpenAI used for its older snapshots. The month and day are
     * range-checked so that an id merely ending in four digits — a context size, a version — is not
     * mistaken for a release.
     */
    const DATE_SUFFIX = /-(?:(\d{4})-?(0[1-9]|1[0-2])-?(0[1-9]|[12]\d|3[01])|(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01]))$/;

    /**
     * The undated form of a release-pinned model id, e.g. `claude-opus-5-20260401` → `claude-opus-5`.
     * Returns `undefined` when the id carries no date suffix.
     */
    export function undatedId(id: string): string | undefined {
        const match = DATE_SUFFIX.exec(id);
        return match ? id.substring(0, match.index) : undefined;
    }

    /**
     * Adds the undated alias for every release-pinned model, keeping the pinned releases themselves.
     *
     * Providers such as Anthropic and OpenAI list one entry per release (`claude-opus-5-20260401`,
     * `claude-opus-5-20251120`, …) while accepting the undated form (`claude-opus-5`) as a
     * request-time alias for the newest of them. The undated id is what the built-in model aliases
     * reference and what does not change from under a configuration when a new release ships, so it
     * is registered even when the provider does not list it. The pinned releases stay registered too,
     * so a specific release can be selected; what keeps them out of the way of the model pickers is
     * that only undated ids are featured (see the favorite models service), not that they are hidden.
     *
     * The alias takes the metadata of the most recent variant. Aliases come first; the reported models
     * keep their relative order after them. An alias the provider reported itself is left untouched.
     */
    export function withUndatedAliases(models: DiscoveredModel[]): DiscoveredModel[] {
        const reported = new Set(models.map(model => model.id));
        const aliases = new Map<string, DiscoveredModel>();
        for (const model of models) {
            const id = undatedId(model.id);
            if (!id || reported.has(id)) {
                continue;
            }
            const previous = aliases.get(id);
            if (!previous || isNewer(model, previous)) {
                aliases.set(id, { ...model, id });
            }
        }
        return [...aliases.values(), ...models];
    }

    /**
     * Whether the id is a pointer a provider maintains at the current model of a family, e.g.
     * `gemini-flash-latest`. Such an id carries no version to compare, and does not need one: it
     * resolves to whatever is newest by definition.
     */
    export function isLatestPointer(id: string): boolean {
        return id.endsWith('-latest');
    }

    /**
     * The version numbers in a model id, e.g. `gemini-3.7-flash` → `[3, 7]` and `claude-sonnet-4-5`
     * → `[4, 5]`. A heuristic, and only meaningful between the models of one provider — and one
     * vendor at that: it says nothing about `gpt-5` against `claude-sonnet-4.5`.
     */
    export function versionOf(id: string): number[] {
        return (id.match(/\d+/g) ?? []).map(Number);
    }

    /**
     * Compares two model ids by the version numbers in them, most recent first. A longer sequence wins
     * a shared prefix, so `gemini-3.7` sorts before `gemini-3`.
     */
    export function compareByVersion(left: string, right: string): number {
        const leftVersion = versionOf(left);
        const rightVersion = versionOf(right);
        for (let index = 0; index < Math.max(leftVersion.length, rightVersion.length); index++) {
            const difference = (rightVersion[index] ?? -1) - (leftVersion[index] ?? -1);
            if (difference !== 0) {
                return difference;
            }
        }
        return 0;
    }

    /**
     * Whether `candidate` is a more recent variant than `current`. The release date the provider
     * reported is authoritative and always comparable, so it decides whenever both carry one; the date
     * in the id is the fallback, and it only orders ids of the same shape — a year-less `-0613` says
     * nothing about which year it belongs to.
     */
    function isNewer(candidate: DiscoveredModel, current: DiscoveredModel): boolean {
        if (candidate.released !== undefined && current.released !== undefined) {
            return candidate.released > current.released;
        }
        return idDate(candidate.id) > idDate(current.id);
    }

    /** The date in a release-pinned id as a comparable number, or `0` when there is none. */
    function idDate(id: string): number {
        const match = DATE_SUFFIX.exec(id);
        if (!match) {
            return 0;
        }
        // Either the full `YYYYMMDD` (groups 1-3) or the year-less `MMDD` (groups 4-5).
        return match[1] ? Number(`${match[1]}${match[2]}${match[3]}`) : Number(`${match[4]}${match[5]}`);
    }
}
