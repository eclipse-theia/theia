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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { CommonCommands, FrontendApplicationContribution, StatusBar, StatusBarAlignment } from '@theia/core/lib/browser';
import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering/markdown-string';
import { PreferenceProviderProvider, PreferenceScope, PreferenceService } from '@theia/core/lib/common/preferences';
import { DisposableCollection, nls } from '@theia/core';

export const SESSION_PREFERENCE_STATUS_BAR_ID = 'session-preference-status';

/**
 * Status bar item that reports preferences whose effective value comes from the
 * in-memory session scope (typically set via `--session-preference`). Each active
 * override is listed in the tooltip with a link that opens the Settings UI filtered
 * to that preference, so the user can read its description there.
 */
@injectable()
export class SessionPreferenceStatusBarContribution implements FrontendApplicationContribution {

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(PreferenceProviderProvider)
    protected readonly providerProvider: PreferenceProviderProvider;

    protected readonly toDispose = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        this.toDispose.push(
            this.preferenceService.onPreferenceChanged(e => {
                // React to both additions and removals of session overrides.
                // Filtering by `isInSessionScope(key)` would miss removals because by the time
                // the event fires, the session value is already gone.
                if (e.scope === PreferenceScope.Session) {
                    this.refresh();
                }
            })
        );
    }

    onStart(): void {
        this.preferenceService.ready.then(() => this.refresh());
    }

    protected refresh(): void {
        const entries = this.collectActive();
        if (entries.length === 0) {
            this.statusBar.removeElement(SESSION_PREFERENCE_STATUS_BAR_ID);
            return;
        }
        const label = nls.localize('theia/preferences/sessionPreferences/statusBar',
            'Session Preferences ({0})', entries.length);
        this.statusBar.setElement(SESSION_PREFERENCE_STATUS_BAR_ID, {
            alignment: StatusBarAlignment.LEFT,
            text: `$(warning) ${label}`,
            tooltip: this.buildTooltip(entries),
            // Lower priority sits further right on the left area, so this entry stays
            // to the right of higher-priority entries (workspace, git, problems).
            priority: 1,
            backgroundColor: 'var(--theia-statusBarItem-prominentBackground)',
            color: 'var(--theia-statusBarItem-prominentForeground)'
        });
    }

    protected collectActive(): ReadonlyArray<[string, unknown]> {
        // Read directly from the session provider rather than walking schema properties,
        // so overrides for keys that aren't registered as schema properties (e.g. a stray
        // `--session-preference foo.bar=1`) still show up here and in the tooltip.
        const sessionProvider = this.providerProvider(PreferenceScope.Session);
        const preferences = sessionProvider?.getPreferences() ?? {};
        const result: [string, unknown][] = Object.entries(preferences);
        // Stable order: alphabetical by key.
        result.sort(([a], [b]) => a.localeCompare(b));
        return result;
    }

    protected buildTooltip(entries: ReadonlyArray<[string, unknown]>): MarkdownStringImpl {
        // `isTrusted` is restricted to the single command we actually emit links for, so
        // a stray `command:` link in any preference key (extremely unlikely) can't execute.
        const md = new MarkdownStringImpl('', {
            supportThemeIcons: true,
            isTrusted: { enabledCommands: [CommonCommands.OPEN_PREFERENCES.id] }
        });
        md.appendMarkdown(`**${nls.localize('theia/preferences/sessionPreferences/tooltipHeader',
            'These settings are overridden for this session')}**\n\n`);
        md.appendMarkdown(nls.localize('theia/preferences/sessionPreferences/tooltipBody',
            'They were passed in via --session-preference and only live in memory. Click a setting name to jump to it in the Settings view.'));
        md.appendMarkdown('\n\n');
        for (const [key, value] of entries) {
            // The setting name is a plain markdown link to the Settings view; the value
            // follows as plain text after a colon. No code-block styling on either side.
            md.appendMarkdown(`[${this.escapeLinkText(key)}](${this.buildOpenSettingsUri(key)}): ${this.formatDisplayValue(value)}\n\n`);
        }
        md.appendMarkdown(nls.localize('theia/preferences/sessionPreferences/tooltipChangeNote',
            'Editing any of these clears its session override for this run. To use the saved values from the next launch on, restart without the --session-preference arguments.'));
        return md;
    }

    protected buildOpenSettingsUri(preferenceKey: string): string {
        // The Settings UI uses its search term, so a plain key string filters the view
        // to that single preference.
        const args = encodeURIComponent(JSON.stringify([preferenceKey]));
        return `command:${CommonCommands.OPEN_PREFERENCES.id}?${args}`;
    }

    /**
     * Produces a readable, no-code-formatting representation of a preference value:
     * strings without surrounding JSON quotes, booleans as on/off, primitives as-is,
     * objects/arrays as compact JSON. The result is shown as plain text in the tooltip.
     */
    protected formatDisplayValue(value: unknown): string {
        if (typeof value === 'string') {
            return value.length === 0 ? '(empty)' : value;
        }
        if (typeof value === 'boolean') {
            return value
                ? nls.localize('theia/preferences/sessionPreferences/valueOn', 'on')
                : nls.localize('theia/preferences/sessionPreferences/valueOff', 'off');
        }
        if (value === undefined) {
            return '(unset)';
        }
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }

    /** Escape `]` so it can't terminate the markdown link early. */
    protected escapeLinkText(text: string): string {
        return text.replace(/\]/g, '\\]');
    }

    onStop(): void {
        this.toDispose.dispose();
        this.statusBar.removeElement(SESSION_PREFERENCE_STATUS_BAR_ID);
    }
}
