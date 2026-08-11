// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});
import { expect } from 'chai';
import { Emitter } from '@theia/core';
import { PreferenceChange } from '@theia/core/lib/common/preferences';
import {
    DEFAULT_TOOL_CONFIRMATION_PREFERENCE,
    TOOL_CONFIRMATION_PREFERENCE,
    ToolConfirmationMode
} from '@theia/ai-chat/lib/common/chat-tool-preferences';
import { AiAllowAllModeChatBanner } from './ai-allow-all-mode-chat-banner';
disableJSDOM();

/**
 * Test double for the subset of `PreferenceService` the banner actually uses.
 * A backing map keyed by preference name provides the session value seen by
 * `inspect(...)`, and a public emitter drives the banner's change listener.
 */
class FakePreferenceService {
    readonly sessionValues = new Map<string, unknown>();
    readonly changeEmitter = new Emitter<PreferenceChange>();
    readonly onPreferenceChanged = this.changeEmitter.event;

    inspect(key: string): { sessionValue: unknown } | undefined {
        if (!this.sessionValues.has(key)) {
            return undefined;
        }
        return { sessionValue: this.sessionValues.get(key) };
    }

    setSession(key: string, value: unknown): void {
        if (value === undefined) {
            this.sessionValues.delete(key);
        } else {
            this.sessionValues.set(key, value);
        }
        // The banner only ever inspects `preferenceName`, so a minimal change payload is enough.
        this.changeEmitter.fire({ preferenceName: key } as unknown as PreferenceChange);
    }
}

describe('AiAllowAllModeChatBanner', () => {

    type Probe = AiAllowAllModeChatBanner & {
        isBypassValue(key: string, value: unknown): boolean;
        collectOverrides(): ReadonlyArray<{ label: string; bypass: boolean }>;
        dismissed: boolean;
        dismissedSignature: string | undefined;
    };

    before(() => {
        disableJSDOM = enableJSDOM();
    });
    after(() => {
        disableJSDOM();
    });

    function createBanner(prefService?: FakePreferenceService): { banner: Probe; prefs: FakePreferenceService } {
        const prefs = prefService ?? new FakePreferenceService();
        const banner = new AiAllowAllModeChatBanner() as Probe;
        // Wire the fake preference service into the private inject site, then run the
        // `@postConstruct` init manually. Doing this without a full DI container keeps the
        // test focused on the banner's own logic.
        (banner as unknown as { preferenceService: FakePreferenceService }).preferenceService = prefs;
        (banner as unknown as { init(): void }).init();
        return { banner, prefs };
    }

    describe('isBypassValue', () => {

        it('flags Allow-All only when the global default is forced to ALWAYS_ALLOW', () => {
            const { banner } = createBanner();
            expect(banner.isBypassValue(DEFAULT_TOOL_CONFIRMATION_PREFERENCE, ToolConfirmationMode.ALWAYS_ALLOW)).to.be.true;
            expect(banner.isBypassValue(DEFAULT_TOOL_CONFIRMATION_PREFERENCE, ToolConfirmationMode.CONFIRM)).to.be.false;
            expect(banner.isBypassValue(DEFAULT_TOOL_CONFIRMATION_PREFERENCE, ToolConfirmationMode.DISABLED)).to.be.false;
        });

        it('does not flag Allow-All for per-tool ALWAYS_ALLOW entries', () => {
            // Per-tool overrides are scoped exceptions and stay informational rather than
            // escalating the strip to the red Allow-All treatment.
            const { banner } = createBanner();
            expect(banner.isBypassValue(TOOL_CONFIRMATION_PREFERENCE, { shellExecute: ToolConfirmationMode.ALWAYS_ALLOW })).to.be.false;
            expect(banner.isBypassValue(TOOL_CONFIRMATION_PREFERENCE, {
                shellExecute: ToolConfirmationMode.ALWAYS_ALLOW,
                writeFile: ToolConfirmationMode.CONFIRM
            })).to.be.false;
            expect(banner.isBypassValue(TOOL_CONFIRMATION_PREFERENCE, {})).to.be.false;
        });

        it('returns false for unrelated keys', () => {
            const { banner } = createBanner();
            expect(banner.isBypassValue('ai-features.AiEnable.enableAI', true)).to.be.false;
            expect(banner.isBypassValue('ai-features.agentMode.enabled', true)).to.be.false;
            expect(banner.isBypassValue('ai-features.chat.defaultChatAgent', 'Coder')).to.be.false;
        });
    });

    describe('collectOverrides', () => {

        it('is empty when no watched preference has a session value', () => {
            const { banner } = createBanner();
            expect(banner.collectOverrides()).to.deep.equal([]);
        });

        it('reports the default tool confirmation with bypass=true when forced to ALWAYS_ALLOW', () => {
            const { banner, prefs } = createBanner();
            prefs.setSession(DEFAULT_TOOL_CONFIRMATION_PREFERENCE, ToolConfirmationMode.ALWAYS_ALLOW);
            const overrides = banner.collectOverrides();
            expect(overrides).to.have.lengthOf(1);
            expect(overrides[0].bypass).to.be.true;
            expect(overrides[0].label).to.contain(ToolConfirmationMode.ALWAYS_ALLOW);
        });

        it('reports per-tool entries with bypass=false', () => {
            const { banner, prefs } = createBanner();
            prefs.setSession(TOOL_CONFIRMATION_PREFERENCE, { shellExecute: ToolConfirmationMode.ALWAYS_ALLOW });
            const overrides = banner.collectOverrides();
            expect(overrides).to.have.lengthOf(1);
            expect(overrides[0].bypass).to.be.false;
            expect(overrides[0].label).to.contain('shellExecute');
        });
    });

    describe('renderBanner', () => {

        it('returns undefined when there are no overrides', () => {
            const { banner } = createBanner();
            expect(banner.renderBanner()).to.equal(undefined);
        });

        it('returns undefined once the strip has been dismissed', () => {
            const { banner, prefs } = createBanner();
            prefs.setSession(DEFAULT_TOOL_CONFIRMATION_PREFERENCE, ToolConfirmationMode.ALWAYS_ALLOW);
            expect(banner.renderBanner()).to.not.equal(undefined);
            banner.dismissed = true;
            expect(banner.renderBanner()).to.equal(undefined);
        });

        it('returns a rendered node when at least one override is active', () => {
            const { banner, prefs } = createBanner();
            prefs.setSession(TOOL_CONFIRMATION_PREFERENCE, { shellExecute: ToolConfirmationMode.ALWAYS_ALLOW });
            expect(banner.renderBanner()).to.not.equal(undefined);
        });
    });

    describe('dismissal reset', () => {

        it('un-dismisses the strip when the override set escalates into a bypass state', () => {
            const { banner, prefs } = createBanner();
            prefs.setSession(TOOL_CONFIRMATION_PREFERENCE, { shellExecute: ToolConfirmationMode.ALWAYS_ALLOW });
            banner.dismissed = true;
            banner.dismissedSignature = (banner as unknown as { overrideSignature(): string }).overrideSignature();

            prefs.setSession(DEFAULT_TOOL_CONFIRMATION_PREFERENCE, ToolConfirmationMode.ALWAYS_ALLOW);

            expect(banner.dismissed).to.be.false;
            expect(banner.dismissedSignature).to.equal(undefined);
        });

        it('un-dismisses the strip when a new override is added while the strip was dismissed', () => {
            const { banner, prefs } = createBanner();
            prefs.setSession(TOOL_CONFIRMATION_PREFERENCE, { shellExecute: ToolConfirmationMode.ALWAYS_ALLOW });
            banner.dismissed = true;
            banner.dismissedSignature = (banner as unknown as { overrideSignature(): string }).overrideSignature();

            // Broaden the per-tool override set. Same key, added tool entry; the signature must differ.
            prefs.setSession(TOOL_CONFIRMATION_PREFERENCE, {
                shellExecute: ToolConfirmationMode.ALWAYS_ALLOW,
                writeFile: ToolConfirmationMode.ALWAYS_ALLOW
            });

            expect(banner.dismissed).to.be.false;
        });

        it('leaves the dismissal alone when a change event fires with the same override set', () => {
            const { banner, prefs } = createBanner();
            prefs.setSession(TOOL_CONFIRMATION_PREFERENCE, { shellExecute: ToolConfirmationMode.ALWAYS_ALLOW });
            banner.dismissed = true;
            banner.dismissedSignature = (banner as unknown as { overrideSignature(): string }).overrideSignature();

            // Fire a change event without actually changing the underlying value.
            prefs.changeEmitter.fire({ preferenceName: TOOL_CONFIRMATION_PREFERENCE } as unknown as PreferenceChange);

            expect(banner.dismissed).to.be.true;
        });
    });
});
