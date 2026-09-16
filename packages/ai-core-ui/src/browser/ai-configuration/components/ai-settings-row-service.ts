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

import { CommandService, Event } from '@theia/core';
import { ContextMenuRenderer } from '@theia/core/lib/browser/context-menu-renderer';
import { PreferenceScope } from '@theia/core/lib/common';
import { PreferenceDataProperty, PreferenceSchemaService } from '@theia/core/lib/common/preferences/preference-schema';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { PreferencesCommands } from '@theia/preferences/lib/browser/util/preference-types';
import { AI_CONFIGURATION_SETTING_CONTEXT_MENU, AiConfigurationSettingCommandArgs } from '../ai-configuration-setting-commands';
import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering/markdown-string';
import { inject, injectable } from '@theia/core/shared/inversify';
import type { SelectOption } from '@theia/core/lib/browser/widgets/select-component';
import { AI_CORE_PREFERENCES_TITLE, MODEL_PROVIDER_TYPE_DETAIL, ModelProviderTypeDetail } from '@theia/ai-core/lib/common/ai-core-preferences';
import { AiConfigurationService } from '@theia/ai-core/lib/common/ai-configuration-service';
import { AiConfigurationScope } from '../ai-configuration-category';

/** Describes which control an `AiSettingsRow` renders for a preference value. */
export type AiSettingsControl =
    | { readonly type: 'boolean' }
    | { readonly type: 'string'; readonly placeholder?: string; readonly password?: boolean }
    /** `integer` distinguishes a whole-number preference from a fractional one, which must not be rounded. */
    | { readonly type: 'number'; readonly integer?: boolean; readonly min?: number; readonly max?: number; readonly step?: number }
    | { readonly type: 'select'; readonly options: SelectOption[] }
    /**
     * `validate` refuses an entry before it is written, returning the message to show; used where the values
     * are more than free text (shell command patterns, for instance, have wildcard rules).
     */
    | { readonly type: 'array'; readonly placeholder?: string; readonly validate?: (value: string) => string | undefined }
    | { readonly type: 'json' };

/**
 * The value of a single preference as seen from a particular {@link AiConfigurationScope},
 * together with the information the {@link AiSettingsRow} needs to render the
 * modified indicator and the reset affordance.
 */
export interface AiSettingsInspection {
    /** Effective value resolved for the requested scope (falling back through broader scopes and the default). */
    readonly value: unknown;
    /** Value explicitly set in the requested scope; `undefined` means the value is inherited or default. */
    readonly scopeValue: unknown;
    /** Default (schema) value. */
    readonly defaultValue: unknown;
    /** `true` when the requested scope explicitly overrides the value, i.e. a reset is meaningful. */
    readonly modified: boolean;
}

/**
 * Thin, injectable wrapper around {@link AiConfigurationService} and {@link MarkdownRenderer}
 * used by the presentational {@link AiSettingsRow} component, which must not itself
 * depend on the DI container. Owning renderers/widgets inject this service and pass
 * it down to the row.
 *
 * All preference reads and writes are routed through {@link AiConfigurationService} — the AI
 * configuration seam — rather than the raw `PreferenceService`, so reads are workspace-trust-aware
 * and the whole view stays insulated from how AI preferences are stored (see
 * {@link AiConfigurationService}). Schema introspection still uses {@link PreferenceSchemaService}
 * directly, as it inspects the registered schema shape rather than stored values.
 */
@injectable()
export class AiSettingsRowService {

    @inject(AiConfigurationService)
    protected readonly aiConfigurationService: AiConfigurationService;

    @inject(MarkdownRenderer)
    protected readonly markdownRenderer: MarkdownRenderer;

    @inject(PreferenceSchemaService)
    protected readonly schemaService: PreferenceSchemaService;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    @inject(ContextMenuRenderer)
    protected readonly contextMenuRenderer: ContextMenuRenderer;

    protected changed: Event<void> | undefined;

    /** Fires whenever an AI preference changes (or the workspace-trust state transitions), so owning widgets can re-render their rows. */
    get onPreferenceChanged(): Event<void> {
        return this.changed ??= Event.map(this.aiConfigurationService.onDidChange, () => undefined);
    }

    inspect(preferenceId: string, scope: AiConfigurationScope, resourceUri?: string): AiSettingsInspection {
        const inspection = this.aiConfigurationService.inspect(preferenceId, resourceUri);
        const defaultValue = inspection?.defaultValue;
        const globalValue = inspection?.globalValue;
        const workspaceValue = inspection?.workspaceValue;
        const folderValue = inspection?.workspaceFolderValue;

        let scopeValue: unknown;
        let value: unknown;
        switch (scope) {
            case 'user':
                scopeValue = globalValue;
                value = globalValue ?? defaultValue;
                break;
            case 'workspace':
                scopeValue = workspaceValue;
                value = workspaceValue ?? globalValue ?? defaultValue;
                break;
            case 'folder':
                scopeValue = folderValue;
                value = folderValue ?? workspaceValue ?? globalValue ?? defaultValue;
                break;
        }
        return { value, scopeValue, defaultValue, modified: scopeValue !== undefined };
    }

    set(preferenceId: string, value: unknown, scope: AiConfigurationScope, resourceUri?: string): Promise<void> {
        return this.aiConfigurationService.set(preferenceId, value, this.toPreferenceScope(scope), resourceUri);
    }

    reset(preferenceId: string, scope: AiConfigurationScope, resourceUri?: string): Promise<void> {
        return this.aiConfigurationService.set(preferenceId, undefined, this.toPreferenceScope(scope), resourceUri);
    }

    /**
     * Opens the underlying `settings.json` file focused on a preference, mirroring the
     * Settings view's "Edit in settings.json" link. Used for `json` controls, i.e. complex
     * object/array values that cannot be edited meaningfully through an inline control.
     */
    editInSettings(preferenceId: string): void {
        this.commandService.executeCommand(PreferencesCommands.OPEN_PREFERENCES_JSON_TOOLBAR.id, preferenceId);
    }

    /**
     * Opens the gear context menu (Reset Setting / Copy Setting ID / Copy Setting as JSON) anchored below the
     * gear. Uses this view's own {@link AI_CONFIGURATION_SETTING_CONTEXT_MENU} commands, backed by
     * {@link AiConfigurationService} and acting in the row's own `scope` — rather than the Settings UI's
     * `RESET_PREFERENCE` command, which is bound to the Preferences editor widget and misbehaves when invoked
     * from here (it resets in the Preferences widget's scope and disturbs focus in this view).
     */
    openSettingContextMenu(gear: HTMLElement, preferenceId: string, value: unknown, scope: AiConfigurationScope, resourceUri?: string): void {
        this.openGearMenu(gear, { id: preferenceId, value, scope: this.toPreferenceScope(scope), resourceUri });
    }

    /**
     * Opens the gear menu for a row backed by non-preference data (e.g. a per-agent setting): the same
     * "Reset Setting" affordance as a preference row, but reset runs the given callback. Copy entries are
     * hidden (no preference id). Lets these rows reuse the shared gear menu instead of a bespoke button.
     */
    openResetMenu(gear: HTMLElement, reset: () => void): void {
        this.openGearMenu(gear, { reset });
    }

    protected openGearMenu(gear: HTMLElement, args: AiConfigurationSettingCommandArgs): void {
        const rect = gear.getBoundingClientRect();
        this.contextMenuRenderer.render({
            menuPath: AI_CONFIGURATION_SETTING_CONTEXT_MENU,
            anchor: { x: rect.left, y: rect.bottom },
            args: [args],
            includeAnchorArg: false,
            context: gear
        });
    }

    /** Renders a markdown description into a detached element for use in a React `ref`. */
    renderMarkdown(markdown: string): HTMLElement {
        return this.markdownRenderer.render(new MarkdownStringImpl(this.normalizeMarkdown(markdown))).element;
    }

    /**
     * Strips the common leading indentation from a markdown description before rendering.
     *
     * Preference `markdownDescription`s are commonly authored as indented, multi-line JavaScript
     * string literals, which leaves every continuation line prefixed with the source indentation.
     * That accidental indentation makes markdown-it collapse bullet lists and paragraphs into a
     * single dense block, so the description reads as an unstructured run-on. Removing the shared
     * indentation (ignoring the first line, which starts right after the opening quote) restores
     * the intended paragraph and list structure while preserving relative indentation, so nested
     * lists stay nested.
     */
    protected normalizeMarkdown(markdown: string): string {
        const lines = markdown.split('\n');
        let common = Number.POSITIVE_INFINITY;
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) {
                continue;
            }
            common = Math.min(common, line.length - line.trimStart().length);
        }
        if (!Number.isFinite(common) || common === 0) {
            return markdown;
        }
        return lines.map((line, index) => (index === 0 ? line : line.slice(common))).join('\n');
    }

    /**
     * Reads the label and (already-localized) markdown description a preference declares in its registered
     * schema, so settings rows do not have to re-author those strings. Returns `undefined` fields when the
     * preference is unknown.
     *
     * Most AI preferences share the group `title` ("AI Features") to be grouped together in the Settings UI,
     * which also ignores it and derives each setting's name from its id. We mirror that: a genuinely specific
     * `title` is used as-is, but the shared group title falls back to the humanized preference id (e.g.
     * `ai-features.google.apiKey` → "Api Key") so rows show their own name rather than "AI Features".
     */
    describe(preferenceId: string): { label?: string; description?: string } {
        const property = this.schemaService.getSchemaProperty(preferenceId);
        if (!property) {
            return { label: undefined, description: undefined };
        }
        const specificTitle = property.title && property.title !== AI_CORE_PREFERENCES_TITLE ? property.title : undefined;
        return {
            label: specificTitle ?? this.formatPreferenceName(preferenceId),
            description: property.markdownDescription ?? property.description
        };
    }

    /** The schema tags declared for a preference (e.g. `['experimental']`), shown as badges next to the title. */
    tags(preferenceId: string): string[] {
        return this.schemaService.getSchemaProperty(preferenceId)?.tags ?? [];
    }

    /**
     * Human-readable name for a preference derived from its id. The `ai-features` root and the area segment
     * (`chat`, `google`, …) are dropped — the category/section already conveys them — and the remaining
     * segments are humanized (camelCase split, first letter upper-cased) and joined with ": ", e.g.
     * `ai-features.chat.tokenUsageIndicator.enabled` → "Token Usage Indicator: Enabled",
     * `ai-features.google.apiKey` → "Api Key".
     */
    protected formatPreferenceName(preferenceId: string): string {
        const parts = preferenceId.split('.');
        const segments = parts.length > 2 ? parts.slice(2) : parts.slice(-1);
        return segments.map(segment => this.humanizeSegment(segment)).join(': ');
    }

    protected humanizeSegment(segment: string): string {
        if (!segment) {
            return segment;
        }
        let formatted = segment[0].toLocaleUpperCase();
        for (let i = 1; i < segment.length; i++) {
            const char = segment[i];
            const previous = segment[i - 1];
            if (this.isUpperCase(char) && !/\s/.test(previous) && !this.isUpperCase(previous)) {
                formatted += ' ';
            }
            formatted += char;
        }
        return formatted.trim();
    }

    protected isUpperCase(char: string): boolean {
        return char === char.toLocaleUpperCase() && char.toLocaleLowerCase() !== char.toLocaleUpperCase();
    }

    /**
     * The human-readable language-model provider name a preference declares in its schema
     * `typeDetails` (as `{ [MODEL_PROVIDER_TYPE_DETAIL]: { label } }`, see {@link ModelProviderTypeDetail}),
     * or `undefined` when none is declared. The Models page uses this to label a provider block without
     * hard-coding provider names.
     */
    modelProviderLabel(preferenceId: string): string | undefined {
        const typeDetails = this.schemaService.getSchemaProperty(preferenceId)?.typeDetails;
        const detail = typeDetails && typeof typeDetails === 'object'
            ? (typeDetails as Record<string, unknown>)[MODEL_PROVIDER_TYPE_DETAIL]
            : undefined;
        if (detail && typeof detail === 'object') {
            const label = (detail as Partial<ModelProviderTypeDetail>).label;
            if (typeof label === 'string') {
                return label;
            }
        }
        return undefined;
    }

    /**
     * Whether a preference declares itself part of a language-model provider block, i.e. carries the
     * `aiModelProvider` {@link MODEL_PROVIDER_TYPE_DETAIL} typeDetail (in any form). The Models page uses
     * this positive marker to discover provider blocks, so feature areas that never claim to be a provider
     * are never mistaken for one.
     */
    isModelProviderPreference(preferenceId: string): boolean {
        const typeDetails = this.schemaService.getSchemaProperty(preferenceId)?.typeDetails;
        return !!typeDetails && typeof typeDetails === 'object' && MODEL_PROVIDER_TYPE_DETAIL in typeDetails;
    }

    /**
     * Builds {@link SelectOption}s from a preference's `enum`, using its `enumItemLabels`
     * (falling back to `enumDescriptions`, then the raw value) for the display label.
     * Returns an empty array when the preference declares no enum.
     */
    enumOptions(preferenceId: string): SelectOption[] {
        const property = this.schemaService.getSchemaProperty(preferenceId);
        const values = property?.enum;
        if (!values) {
            return [];
        }
        // The label must be the value (or an explicit `enumItemLabels` entry) — never `enumDescriptions`,
        // which is the option's explanatory text and belongs in `description`, not in the label.
        const labels = property?.enumItemLabels;
        const descriptions = property?.enumDescriptions;
        return values.map((value, index) => ({
            value: String(value),
            label: labels?.[index] ?? String(value),
            description: descriptions?.[index]
        }));
    }

    /** All registered preference ids, e.g. to discover a provider's `ai-features.<provider>.*` block. */
    preferenceIds(): string[] {
        return Array.from(this.schemaService.getSchemaProperties().keys());
    }

    /** All displayable `ai-features.*` preference ids — every AI setting that should appear somewhere in the view. */
    aiFeaturePreferenceIds(): string[] {
        return this.preferenceIds().filter(id => id.startsWith('ai-features.') && this.isDisplayable(id));
    }

    /**
     * Whether a preference is meant to be surfaced as an editable settings row in the AI Configuration
     * view. Excludes only value-less placeholders (`type: 'null'`), such as the redirect entries that
     * only link to this view. The Settings-UI `hidden` flag is intentionally ignored: the AI
     * Configuration view is the dedicated editor for AI preferences, which are hidden from the Settings
     * UI once the cutover (#316) is in effect but must still be editable here.
     */
    isDisplayable(preferenceId: string): boolean {
        const property = this.schemaService.getSchemaProperty(preferenceId);
        if (!property) {
            return false;
        }
        return property.type !== 'null';
    }

    /**
     * Infers a sensible {@link AiSettingsControl} for a preference from its schema `type`
     * (a `select` when it declares an `enum`, a masked text input for secrets/API keys). An `array` of strings
     * gets the inline list editor; more complex values — an `object` or an `array` of objects/other types —
     * cannot be edited meaningfully inline, so they resolve to a `json` control that defers to the
     * `settings.json` file. Falls back to a text input for unknown types.
     */
    controlFor(preferenceId: string): AiSettingsControl {
        const property = this.schemaService.getSchemaProperty(preferenceId);
        if (property?.enum) {
            return { type: 'select', options: this.enumOptions(preferenceId) };
        }
        switch (property?.type) {
            case 'boolean':
                return { type: 'boolean' };
            case 'number':
                return { type: 'number', min: property.minimum, max: property.maximum };
            case 'integer':
                return { type: 'number', integer: true, min: property.minimum, max: property.maximum };
            case 'array':
                return this.isStringArray(property) ? { type: 'array' } : { type: 'json' };
            case 'object':
                return { type: 'json' };
            default:
                return { type: 'string', password: this.isSecret(preferenceId) };
        }
    }

    /**
     * Whether an `array` preference holds plain string items, so it can be edited with the inline list editor
     * (matching the Settings UI, which only offers its array input for `string[]`); everything else defers to
     * a `json` control.
     */
    protected isStringArray(property: PreferenceDataProperty): boolean {
        const items = property.items;
        const itemSchema = Array.isArray(items) ? items[0] : items;
        return itemSchema?.type === 'string';
    }

    /**
     * Whether a preference holds a secret (an API key, token or password) that should be masked. There is no
     * schema flag for this, so it is inferred from the id's leaf segment, matching how every AI provider names
     * its key preference (e.g. `ai-features.anthropic.apiKey`).
     */
    protected isSecret(preferenceId: string): boolean {
        const leaf = preferenceId.substring(preferenceId.lastIndexOf('.') + 1).toLowerCase();
        return leaf.endsWith('apikey') || leaf.endsWith('token') || leaf.endsWith('secret') || leaf.endsWith('password');
    }

    protected toPreferenceScope(scope: AiConfigurationScope): PreferenceScope {
        switch (scope) {
            case 'user':
                return PreferenceScope.User;
            case 'workspace':
                return PreferenceScope.Workspace;
            case 'folder':
                return PreferenceScope.Folder;
        }
    }
}
