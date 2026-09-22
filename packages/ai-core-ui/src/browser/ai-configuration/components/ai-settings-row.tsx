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

import { nls } from '@theia/core';
import * as React from '@theia/core/shared/react';
import { AiConfigurationScope } from '../ai-configuration-category';
import { AiSettingsControl, AiSettingsRowService } from './ai-settings-row-service';
import { AiArrayInput, AiEditInSettingsButton, AiEnumSelect, AiNumberStepper, AiTextInput, AiToggleSwitch } from './ai-configuration-controls';
import { AiConfigurationSettingRow } from './ai-configuration-setting-row';

export interface AiSettingsRowProps {
    /** Service wrapping preference read/write and markdown rendering (injected by the owning widget). */
    readonly service: AiSettingsRowService;
    /** Preference id read and written by this row. */
    readonly preferenceId: string;
    /** Row label. Falls back to the preference id when omitted. */
    readonly label?: string;
    /** Optional markdown description rendered under the label. */
    readonly description?: string;
    /** Scope the row reads from and writes to (from the render context). */
    readonly scope: AiConfigurationScope;
    /** The control to render for the value. */
    readonly control: AiSettingsControl;
    /** Renders the control read-only, e.g. while the setting's feature gate is turned off. */
    readonly disabled?: boolean;
    /** Resource URI for `folder`-scoped preferences. */
    readonly resourceUri?: string;
    /** Called after a value is written or reset, so the owner can re-render. */
    readonly onDidChange?: () => void;
    /** Stable id used by the shell to scroll-to and flash this row after deep-search navigation. */
    readonly rowId?: string;
    /** Extra action(s) shown top-right (e.g. a "Reset All" button); forwarded to the presentational row. */
    readonly actions?: React.ReactNode;
}

/**
 * Every control renders full-width below the label/description except the boolean toggle, which stays inline
 * on the right. This gives a single, consistent layout across the pages (mirroring the Settings UI, where the
 * control sits under the description) instead of mixing right-aligned and below controls.
 */
const INLINE_CONTROL_TYPES = new Set<AiSettingsControl['type']>(['boolean']);

/**
 * Service-driven per-setting row: reads/writes a preference id via the injected
 * {@link AiSettingsRowService} and renders through the shared {@link AiConfigurationSettingRow}, so
 * it looks identical to the hand-authored rows on the General and Models pages. The control is chosen
 * from {@link AiSettingsRowProps.control}; compact controls render inline, wide ones (chips, text)
 * render full-width below.
 */
export const AiSettingsRow: React.FC<AiSettingsRowProps> = ({
    service, preferenceId, label, description, scope, control, disabled, resourceUri, onDidChange, rowId, actions
}) => {
    const inspection = service.inspect(preferenceId, scope, resourceUri);
    // Fall back to the (already-localized) label and description from the preference schema.
    const described = service.describe(preferenceId);
    const effectiveLabel = label ?? described.label ?? preferenceId;
    const effectiveDescription = description ?? described.description;
    // Stable identity so the description's effect does not re-render markdown on every render.
    const renderMarkdown = React.useCallback((markdown: string) => service.renderMarkdown(markdown), [service]);

    const commit = (value: unknown): void => {
        service.set(preferenceId, value, scope, resourceUri)
            .then(() => onDidChange?.())
            // `console` rather than an `ILogger`: these row components are deliberately DI-free, so there is
            // no injection context here (the service they write through is the injected part).
            .catch(error => console.error(`Failed to set preference '${preferenceId}'`, error));
    };
    const openMenu = React.useCallback(
        (gear: HTMLElement) => service.openSettingContextMenu(gear, preferenceId, inspection.value, scope, resourceUri),
        [service, preferenceId, inspection.value, scope, resourceUri]
    );

    const controlNode = <AiSettingsRowControl
        control={control}
        value={inspection.value}
        label={effectiveLabel}
        disabled={disabled}
        onCommit={commit}
        onEditInSettings={() => service.editInSettings(preferenceId)}
    />;
    const below = !INLINE_CONTROL_TYPES.has(control.type);

    return <AiConfigurationSettingRow
        preferenceId={rowId ?? preferenceId}
        title={effectiveLabel}
        description={effectiveDescription}
        renderMarkdown={renderMarkdown}
        modified={inspection.modified}
        tags={service.tags(preferenceId)}
        onOpenMenu={openMenu}
        control={below ? undefined : controlNode}
        below={below ? controlNode : undefined}
        actions={actions}
    />;
};

/**
 * Renders the shared control for a schema-derived {@link AiSettingsControl}, so generically-discovered
 * preferences get the same controls as the hand-authored pages. Boolean→toggle, number→stepper,
 * enum→select, array→chip editor, object/array-of-objects→"Edit in settings.json", everything else→text.
 */
export const AiSettingsRowControl: React.FC<{
    control: AiSettingsControl;
    value: unknown;
    label: string;
    disabled?: boolean;
    onCommit: (value: unknown) => void;
    /** Invoked by the `json` control to open `settings.json` focused on the preference. */
    onEditInSettings: () => void;
}> = ({ control, value, label, disabled, onCommit, onEditInSettings }) => {
    switch (control.type) {
        case 'boolean':
            return <AiToggleSwitch checked={value === true} ariaLabel={label} disabled={disabled} onChange={onCommit} />;
        case 'select':
            return <AiEnumSelect
                value={value === undefined ? undefined : String(value)}
                ariaLabel={label}
                disabled={disabled}
                options={control.options.map(option => ({
                    value: String(option.value ?? ''),
                    label: option.label ?? String(option.value ?? ''),
                    title: option.description
                }))}
                onCommit={onCommit}
            />;
        case 'number':
            return <AiNumberStepper
                value={typeof value === 'number' ? value : (control.min ?? 0)}
                ariaLabel={label}
                integer={control.integer}
                min={control.min}
                max={control.max}
                disabled={disabled}
                onCommit={onCommit}
            />;
        case 'array':
            return <AiArrayInput
                values={Array.isArray(value) ? value.map(String) : []}
                ariaLabel={label}
                addPlaceholder={control.placeholder ?? nls.localize('theia/ai/core/aiConfiguration/addValue', 'Add Value...')}
                validate={control.validate}
                disabled={disabled}
                onChange={onCommit}
            />;
        case 'json':
            return <AiEditInSettingsButton
                label={nls.localizeByDefault('Edit in settings.json')}
                ariaLabel={label}
                disabled={disabled}
                onClick={onEditInSettings}
            />;
        case 'string':
        default:
            return <AiTextInput
                value={typeof value === 'string' ? value : ''}
                ariaLabel={label}
                placeholder={control.type === 'string' ? control.placeholder : undefined}
                password={control.type === 'string' ? control.password : undefined}
                disabled={disabled}
                onCommit={onCommit}
            />;
    }
};
