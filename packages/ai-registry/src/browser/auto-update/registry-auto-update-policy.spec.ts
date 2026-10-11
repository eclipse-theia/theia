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

import { expect } from 'chai';
import { PreferenceService } from '@theia/core';
import { AUTO_UPDATE_OVERRIDES_PREF, AUTO_UPDATE_PREF, AutoUpdateMode } from '../../common/ai-registry-preferences';
import { RegistryAutoUpdatePolicyImpl } from './registry-auto-update-policy';

/** Minimal in-memory stand-in for the two preferences the policy reads and writes. */
class TestPolicy extends RegistryAutoUpdatePolicyImpl {
    readonly values: Record<string, unknown> = {};
    writes = 0;

    constructor(defaultMode?: string, overrides?: Record<string, string>) {
        super();
        if (defaultMode !== undefined) {
            this.values[AUTO_UPDATE_PREF] = defaultMode;
        }
        if (overrides !== undefined) {
            this.values[AUTO_UPDATE_OVERRIDES_PREF] = overrides;
        }
        // Object.assign rather than a direct write: `preferenceService` is declared readonly
        // on the base class, so it can only be assigned in that class's own constructor.
        Object.assign(this, {
            preferenceService: {
                get: (name: string, defaultValue: unknown) => this.values[name] ?? defaultValue,
                // Mirrors the real service: `globalValue` is only set once someone has written
                // the preference, which is what distinguishes a chosen default from the schema one.
                inspect: (name: string) => ({ globalValue: this.values[name] }),
                set: async (name: string, value: unknown) => {
                    this.writes++;
                    this.values[name] = value;
                }
            } as unknown as PreferenceService
        });
    }

    get overrides(): Record<string, AutoUpdateMode> {
        return (this.values[AUTO_UPDATE_OVERRIDES_PREF] ?? {}) as Record<string, AutoUpdateMode>;
    }
}

describe('RegistryAutoUpdatePolicy', () => {

    it('namespaces override keys by artifact kind', () => {
        const policy = new TestPolicy();
        expect(policy.key('skill', 'io.github.example/skill')).to.equal('skill:io.github.example/skill');
        expect(policy.key('mcp', 'io.github.example/server')).to.equal('mcp:io.github.example/server');
    });

    it('defaults to ask when the preference is unset or holds an unknown value', () => {
        expect(new TestPolicy().getDefault()).to.equal('ask');
        expect(new TestPolicy('bogus').getDefault()).to.equal('ask');
    });

    it('falls back to the default for an artifact without an override', () => {
        const policy = new TestPolicy('on');
        expect(policy.getMode('skill', 'unknown-skill')).to.equal('on');
    });

    it('prefers the artifact override over the default', () => {
        const policy = new TestPolicy('on', { 'skill:pinned': 'off' });
        expect(policy.getMode('skill', 'pinned')).to.equal('off');
        expect(policy.getMode('skill', 'other')).to.equal('on');
    });

    it('keeps artifact kinds apart when the same id exists for both', () => {
        const policy = new TestPolicy('ask', { 'skill:shared': 'on', 'mcp:shared': 'off' });
        expect(policy.getMode('skill', 'shared')).to.equal('on');
        expect(policy.getMode('mcp', 'shared')).to.equal('off');
    });

    it('falls back to the default for an artifact with no registry id', () => {
        const policy = new TestPolicy('off');
        expect(policy.getMode('mcp', undefined)).to.equal('off');
    });

    it('writes an override that differs from the default', async () => {
        const policy = new TestPolicy('ask');
        await policy.setMode('skill', 'example', 'on');
        expect(policy.overrides).to.deep.equal({ 'skill:example': 'on' });
    });

    it('removes the override when the chosen mode equals the default', async () => {
        const policy = new TestPolicy('ask', { 'skill:example': 'on', 'mcp:other': 'off' });
        await policy.setMode('skill', 'example', 'ask');
        expect(policy.overrides).to.deep.equal({ 'mcp:other': 'off' });
    });

    it('does not write when the artifact already follows the default', async () => {
        const policy = new TestPolicy('ask');
        await policy.setMode('skill', 'example', 'ask');
        expect(policy.writes).to.equal(0);
        expect(policy.overrides).to.deep.equal({});
    });

    it('does not write when the override is already the chosen mode', async () => {
        const policy = new TestPolicy('ask', { 'skill:example': 'off' });
        await policy.setMode('skill', 'example', 'off');
        expect(policy.writes).to.equal(0);
    });

    it('clears the override of an uninstalled artifact and keeps the others', async () => {
        const policy = new TestPolicy('ask', { 'skill:example': 'on', 'mcp:other': 'off' });
        await policy.clearMode('skill', 'example');
        expect(policy.overrides).to.deep.equal({ 'mcp:other': 'off' });
    });

    it('does not write when clearing an artifact that has no override', async () => {
        const policy = new TestPolicy('ask', { 'mcp:other': 'off' });
        await policy.clearMode('skill', 'example');
        expect(policy.writes).to.equal(0);
    });

    it('reports no explicit default until one is written', async () => {
        const policy = new TestPolicy();
        expect(policy.hasExplicitDefault()).to.be.false;
        await policy.setDefault('on');
        expect(policy.hasExplicitDefault()).to.be.true;
        expect(policy.getDefault()).to.equal('on');
    });

    it('reports an explicit default even when it equals the schema default', async () => {
        const policy = new TestPolicy();
        await policy.setDefault('ask');
        expect(policy.hasExplicitDefault()).to.be.true;
        expect(policy.getDefault()).to.equal('ask');
    });

    it('leaves existing overrides alone when the default changes', async () => {
        const policy = new TestPolicy('ask', { 'skill:example': 'on' });
        await policy.setDefault('on');
        expect(policy.overrides).to.deep.equal({ 'skill:example': 'on' });
        expect(policy.getMode('skill', 'example')).to.equal('on');
    });

    it('lets an artifact follow a changed default once its override is removed', async () => {
        const policy = new TestPolicy('ask', { 'skill:example': 'on' });
        await policy.setMode('skill', 'example', 'ask');
        policy.values[AUTO_UPDATE_PREF] = 'off';
        expect(policy.getMode('skill', 'example')).to.equal('off');
    });
});
