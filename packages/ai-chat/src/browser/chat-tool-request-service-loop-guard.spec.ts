// *****************************************************************************
// Copyright (C) 2026 Ericsson.
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
import { PreferenceService } from '@theia/core/lib/common';
import { MutableChatRequestModel } from '../common/chat-model.js';
import { ToolLoopGuardConfig } from '../common/chat-tool-request-service.js';
import {
    TOOL_LOOP_GUARD_ENABLED_PREF,
    TOOL_LOOP_GUARD_REFRESH_THRESHOLD_PREF,
    TOOL_LOOP_GUARD_PROMPT_THRESHOLD_PREF,
    TOOL_LOOP_GUARD_FAIL_THRESHOLD_PREF
} from '../common/ai-chat-preferences.js';
import { FrontendChatToolRequestService } from './chat-tool-request-service.js';

/** Minimal PreferenceService stub serving values from a plain map, falling back to the supplied default. */
function preferenceServiceFrom(values: Record<string, unknown>): PreferenceService {
    return {
        get<T>(key: string, defaultValue?: T): T | undefined {
            return (key in values ? values[key] : defaultValue) as T | undefined;
        }
    } as unknown as PreferenceService;
}

/** Exposes the protected threshold-derivation logic and lets a test drive the preferences. */
class TestFrontendChatToolRequestService extends FrontendChatToolRequestService {
    constructor(values: Record<string, unknown>) {
        super();
        (this as unknown as { preferenceService: PreferenceService }).preferenceService = preferenceServiceFrom(values);
    }
    resolveConfig(): ToolLoopGuardConfig {
        return this.getLoopGuardConfig(undefined as unknown as MutableChatRequestModel);
    }
}

function configFor(values: Record<string, unknown>): ToolLoopGuardConfig {
    return new TestFrontendChatToolRequestService(values).resolveConfig();
}

describe('FrontendChatToolRequestService loop guard config', () => {

    it('uses the documented defaults when no preferences are set', () => {
        const config = configFor({});
        expect(config).to.deep.equal({ enabled: true, refreshThreshold: 3, promptThreshold: 4, failThreshold: 5 });
    });

    it('reserves a dedicated attempt for the prompt when only the refresh threshold is raised', () => {
        // Regression: refresh=4 with the default prompt (4) and fail (5) used to collapse to
        // prompt=4/fail=5, so attempt 4 returned from the refresh branch, attempt 5 failed, and the
        // Continue/Stop prompt was never reached. The three stages must now land on distinct attempts.
        const config = configFor({ [TOOL_LOOP_GUARD_REFRESH_THRESHOLD_PREF]: 4 });
        expect(config.refreshThreshold).to.equal(4);
        expect(config.promptThreshold).to.be.greaterThan(config.refreshThreshold);
        expect(config.failThreshold).to.be.greaterThan(config.promptThreshold);
    });

    it('keeps refresh < prompt < fail for adjacent thresholds', () => {
        const config = configFor({
            [TOOL_LOOP_GUARD_REFRESH_THRESHOLD_PREF]: 3,
            [TOOL_LOOP_GUARD_PROMPT_THRESHOLD_PREF]: 3,
            [TOOL_LOOP_GUARD_FAIL_THRESHOLD_PREF]: 3
        });
        expect(config.refreshThreshold).to.equal(3);
        expect(config.promptThreshold).to.equal(4);
        expect(config.failThreshold).to.equal(5);
    });

    it('raises the fail threshold above the prompt threshold when the user sets them equal', () => {
        const config = configFor({
            [TOOL_LOOP_GUARD_REFRESH_THRESHOLD_PREF]: 2,
            [TOOL_LOOP_GUARD_PROMPT_THRESHOLD_PREF]: 5,
            [TOOL_LOOP_GUARD_FAIL_THRESHOLD_PREF]: 5
        });
        expect(config.promptThreshold).to.equal(5);
        expect(config.failThreshold).to.equal(6);
    });

    it('disables the prompt when the prompt threshold is 0 and keeps fail above refresh', () => {
        const config = configFor({
            [TOOL_LOOP_GUARD_REFRESH_THRESHOLD_PREF]: 4,
            [TOOL_LOOP_GUARD_PROMPT_THRESHOLD_PREF]: 0,
            [TOOL_LOOP_GUARD_FAIL_THRESHOLD_PREF]: 4
        });
        expect(config.promptThreshold).to.equal(0);
        expect(config.refreshThreshold).to.equal(4);
        expect(config.failThreshold).to.equal(5);
    });

    it('honors a fully specified, well-ordered configuration unchanged', () => {
        const config = configFor({
            [TOOL_LOOP_GUARD_ENABLED_PREF]: true,
            [TOOL_LOOP_GUARD_REFRESH_THRESHOLD_PREF]: 3,
            [TOOL_LOOP_GUARD_PROMPT_THRESHOLD_PREF]: 5,
            [TOOL_LOOP_GUARD_FAIL_THRESHOLD_PREF]: 8
        });
        expect(config).to.deep.equal({ enabled: true, refreshThreshold: 3, promptThreshold: 5, failThreshold: 8 });
    });

    it('passes the disabled flag through', () => {
        const config = configFor({ [TOOL_LOOP_GUARD_ENABLED_PREF]: false });
        expect(config.enabled).to.equal(false);
    });
});
