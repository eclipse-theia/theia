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

import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { codicon } from '@theia/core/lib/browser';
import { DisposableCollection, Emitter, Event } from '@theia/core';
import { nls } from '@theia/core/lib/common/nls';
import { PreferenceService } from '@theia/core/lib/common';
import { ChatBannerProvider } from '@theia/ai-chat-ui/lib/browser/chat-banner-provider';
import {
    DEFAULT_TOOL_CONFIRMATION_PREFERENCE,
    TOOL_CONFIRMATION_PREFERENCE,
    ToolConfirmationMode
} from '@theia/ai-chat/lib/common/chat-tool-preferences';

interface AiSessionOverride {
    /** Human-readable label, e.g. "Default tool confirmation: always_allow". */
    label: string;
    /** Whether this override bypasses AI tool confirmations globally. */
    bypass: boolean;
}

/**
 * Persistent strip rendered above the chat content whenever an AI tool confirmation
 * preference (`ai-features.chat.defaultToolConfirmation` or `ai-features.chat.toolConfirmation`)
 * is active in the session scope (typically set via `--session-preference`). When the
 * global default is forced to "Allow All" the strip is shown in error styling as the
 * Theia AI Allow-All Mode banner; per-tool confirmation overrides use warning styling.
 *
 * Other AI-namespaced session overrides (e.g. forced-on AI features, default chat agent)
 * are reported by the generic Session Preferences status bar item and intentionally not
 * duplicated here.
 */
@injectable()
export class AiAllowAllModeChatBanner implements ChatBannerProvider {

    readonly priority = 1000;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    protected readonly toDispose = new DisposableCollection();
    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    /**
     * Only tool confirmation preferences are watched here. Other AI session overrides
     * (enable AI, agent mode, default chat agent, etc.) are surfaced in the generic
     * Session Preferences status bar item to keep the banner from duplicating the list.
     */
    protected readonly watchedKeys: ReadonlyArray<string> = [
        DEFAULT_TOOL_CONFIRMATION_PREFERENCE,
        TOOL_CONFIRMATION_PREFERENCE
    ];

    /**
     * Process-lifetime dismissal flag. Reset on the next launch so the user is
     * always reminded once per process, but can hide it for the current session.
     */
    protected dismissed = false;

    @postConstruct()
    protected init(): void {
        const watched = new Set(this.watchedKeys);
        this.toDispose.push(this.preferenceService.onPreferenceChanged(e => {
            if (watched.has(e.preferenceName)) {
                this.onDidChangeEmitter.fire();
            }
        }));
    }

    renderBanner(): React.ReactNode | undefined {
        if (this.dismissed) {
            return undefined;
        }
        const overrides = this.collectOverrides();
        if (overrides.length === 0) {
            return undefined;
        }
        const isAllowAll = overrides.some(override => override.bypass);
        const className = `theia-ai-allow-all-mode-strip ${isAllowAll ? 'is-allow-all' : 'is-overrides'}`;
        const title = isAllowAll
            ? nls.localize('theia/ai/ide/allowAllMode/title', 'Theia AI Allow-All Mode')
            : nls.localize('theia/ai/ide/toolConfirmationOverrides/title', 'AI Tool Confirmation Overrides');
        const tooltipLines = [
            isAllowAll
                ? nls.localize('theia/ai/ide/allowAllMode/stripTooltip',
                    'AI tool calls run without confirmation in this session. Only enable in environments you trust.')
                : nls.localize('theia/ai/ide/toolConfirmationOverrides/stripTooltip',
                    'One or more AI tools are auto-approved for this session via command-line flags.'),
            '',
            ...overrides.map(override => `• ${override.label}`),
            '',
            nls.localize('theia/ai/ide/allowAllMode/stripTooltipFooter',
                'Set via --session-preference. Restart without the flag to restore your saved settings.')
        ];
        return <div
            className={className}
            title={tooltipLines.join('\n')}
            role='status'
            aria-live='polite'>
            <span className={`theia-ai-allow-all-mode-strip-icon ${codicon('warning')}`}></span>
            <span className='theia-ai-allow-all-mode-strip-title'>{title}</span>
            <button
                type='button'
                className={`theia-ai-allow-all-mode-strip-dismiss ${codicon('close')}`}
                title={nls.localize('theia/ai/ide/allowAllMode/dismiss', 'Hide for this session')}
                aria-label={nls.localize('theia/ai/ide/allowAllMode/dismiss', 'Hide for this session')}
                onClick={this.handleDismiss}
            />
        </div>;
    }

    /** AI-relevant preferences currently coming from the session scope. */
    protected collectOverrides(): AiSessionOverride[] {
        const overrides: AiSessionOverride[] = [];
        for (const key of this.watchedKeys) {
            const sessionValue = this.preferenceService.inspect(key)?.sessionValue;
            if (sessionValue === undefined) {
                continue;
            }
            overrides.push({
                label: this.describe(key, sessionValue),
                bypass: this.isBypassValue(key, sessionValue)
            });
        }
        return overrides;
    }

    /**
     * Returns `true` only when the global default is forced to Allow-All. Per-tool
     * `always_allow` entries via `TOOL_CONFIRMATION_PREFERENCE` are scoped exceptions
     * and remain in the banner as informational (warning) entries rather than escalating
     * the whole strip to the red "Allow-All Mode" treatment.
     */
    protected isBypassValue(key: string, value: unknown): boolean {
        if (key === DEFAULT_TOOL_CONFIRMATION_PREFERENCE) {
            return value === ToolConfirmationMode.ALWAYS_ALLOW;
        }
        return false;
    }

    protected describe(key: string, value: unknown): string {
        switch (key) {
            case DEFAULT_TOOL_CONFIRMATION_PREFERENCE:
                return nls.localize('theia/ai/ide/sessionOverride/defaultToolConfirmation',
                    'Default tool confirmation: {0}', String(value));
            case TOOL_CONFIRMATION_PREFERENCE: {
                if (value && typeof value === 'object') {
                    const entries = Object.entries(value as Record<string, unknown>)
                        .map(([tool, mode]) => `${tool}=${mode}`)
                        .join(', ');
                    return nls.localize('theia/ai/ide/sessionOverride/toolConfirmation',
                        'Per-tool confirmation overrides: {0}', entries);
                }
                return nls.localize('theia/ai/ide/sessionOverride/toolConfirmationGeneric',
                    'Per-tool confirmation overrides set');
            }
            default:
                return `${key} = ${JSON.stringify(value)}`;
        }
    }

    protected handleDismiss = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        this.dismissed = true;
        this.onDidChangeEmitter.fire();
    };

    dispose(): void {
        this.toDispose.dispose();
    }
}
