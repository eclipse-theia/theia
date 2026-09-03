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

/**
 * Presentational, DI-free form controls shared across the AI configuration pages so that a given
 * logical control (a toggle, a text input, a select, a numeric stepper, a chip/tag editor) looks
 * and behaves the same regardless of which category renders it. Owners pass in the current value
 * and an `onChange`/`onCommit` callback; controls that edit free text commit on blur/Enter so that
 * typing does not write a preference per keystroke.
 *
 * All classes are prefixed `ai-config-` and are styled in `ai-configuration-components.css`.
 */

import { nls } from '@theia/core';
import { codicon } from '@theia/core/lib/browser';
import { SelectComponent, SelectOption } from '@theia/core/lib/browser/widgets/select-component';
import * as React from '@theia/core/shared/react';

/** Accessible toggle switch backed by a real checkbox; `large` renders the hero-sized variant. */
export const AiToggleSwitch: React.FC<{
    checked: boolean;
    ariaLabel: string;
    disabled?: boolean;
    large?: boolean;
    onChange: (checked: boolean) => void;
}> = ({ checked, ariaLabel, disabled, large, onChange }) => (
    <label className={`ai-config-switch${large ? ' ai-config-switch-large' : ''}`}>
        <input
            type='checkbox'
            checked={checked}
            disabled={disabled}
            aria-label={ariaLabel}
            onChange={e => onChange(e.target.checked)}
        />
        <span className='ai-config-switch-track'><span className='ai-config-switch-thumb'></span></span>
    </label>
);

/** Single-line text input committing on blur or Enter (so typing does not write a preference per keystroke). */
export const AiTextInput: React.FC<{
    value: string;
    ariaLabel: string;
    placeholder?: string;
    disabled?: boolean;
    monospace?: boolean;
    /** Masks the value (`type=password`) and disables autocomplete/spellcheck; used for API keys and secrets. */
    password?: boolean;
    /** Marks the input as invalid (error border) and, with {@link errorMessage}, shows the message beneath it. */
    invalid?: boolean;
    /** Validation message shown under the input when {@link invalid} is set. */
    errorMessage?: string;
    onCommit: (value: string) => void;
}> = ({ value, ariaLabel, placeholder, disabled, monospace, password, invalid, errorMessage, onCommit }) => {
    const [draft, setDraft] = React.useState(value);
    React.useEffect(() => setDraft(value), [value]);
    const commitIfChanged = (): void => {
        if (draft !== value) {
            onCommit(draft);
        }
    };
    return <span className='ai-config-input-wrap'>
        <input
            className={`theia-input ai-config-input${monospace ? ' ai-config-input-mono' : ''}${invalid ? ' error' : ''}`}
            type={password ? 'password' : 'text'}
            value={draft}
            aria-label={ariaLabel}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete={password ? 'off' : undefined}
            spellCheck={false}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitIfChanged}
            onKeyDown={e => { if (e.key === 'Enter') { commitIfChanged(); } }}
        />
        {invalid && errorMessage && <span className='ai-config-input-error'>{errorMessage}</span>}
    </span>;
};

/** Keeps a value inside the preference's `minimum`/`maximum`, either of which may be absent. */
export function clampNumber(value: number, min: number | undefined, max: number | undefined): number {
    let result = value;
    if (min !== undefined) {
        result = Math.max(min, result);
    }
    if (max !== undefined) {
        result = Math.min(max, result);
    }
    return result;
}

/** A `− value +` numeric stepper. Commits on blur/Enter (typing) and immediately on the buttons. */
export const AiNumberStepper: React.FC<{
    value: number;
    ariaLabel: string;
    /**
     * Whole numbers only, i.e. the preference is declared `integer`. A `number` preference keeps what the
     * user typed: rounding it would turn a delay of `1.5` seconds into `2` on commit.
     */
    integer?: boolean;
    min?: number;
    max?: number;
    disabled?: boolean;
    onCommit: (value: number) => void;
}> = ({ value, ariaLabel, integer, min, max, disabled, onCommit }) => {
    const [draft, setDraft] = React.useState(String(value));
    React.useEffect(() => setDraft(String(value)), [value]);
    const commitDraft = (): void => {
        const parsed = Number(draft);
        const rounded = integer ? Math.round(parsed) : parsed;
        const next = clampNumber(Number.isNaN(parsed) ? value : rounded, min, max);
        setDraft(String(next));
        if (next !== value) {
            onCommit(next);
        }
    };
    const step = (delta: number): void => {
        const next = clampNumber(value + delta, min, max);
        if (next !== value) {
            onCommit(next);
        }
    };
    return <span className='ai-config-stepper-wrap'>
        <span className='ai-config-stepper'>
            <button
                type='button'
                className='ai-config-stepper-button'
                aria-label={nls.localize('theia/ai/core/aiConfiguration/decrease', 'Decrease')}
                disabled={disabled || (min !== undefined && value <= min)}
                onClick={() => step(-1)}
            >−</button>
            <input
                className='ai-config-stepper-input'
                inputMode='numeric'
                aria-label={ariaLabel}
                value={draft}
                disabled={disabled}
                onChange={e => setDraft(e.target.value)}
                onBlur={commitDraft}
                onKeyDown={e => { if (e.key === 'Enter') { commitDraft(); } }}
            />
            <button
                type='button'
                className='ai-config-stepper-button'
                aria-label={nls.localize('theia/ai/core/aiConfiguration/increase', 'Increase')}
                disabled={disabled || (max !== undefined && value >= max)}
                onClick={() => step(1)}
            >+</button>
        </span>
    </span>;
};

/**
 * A `string[]` editor mirroring the Settings UI array input: each value is a list row with a hover-revealed
 * remove button, and a final "Add Value…" input (Enter or the + button appends). It reuses the Settings UI's
 * DOM shape and class names (styled by our own `.ai-config-array` rules) so it looks identical, without
 * depending on the preferences package's DI-bound renderer. Values commit immediately on add/remove.
 */
export const AiArrayInput: React.FC<{
    values: string[];
    ariaLabel: string;
    addPlaceholder: string;
    disabled?: boolean;
    /** Returns why an entry is not acceptable, or `undefined` to accept it. Rejected entries are not added. */
    validate?: (value: string) => string | undefined;
    onChange: (values: string[]) => void;
}> = ({ values, ariaLabel, addPlaceholder, disabled, validate, onChange }) => {
    const [draft, setDraft] = React.useState('');
    const [error, setError] = React.useState<string | undefined>(undefined);
    const addItem = (): void => {
        const entry = draft.trim();
        if (!entry) {
            setDraft('');
            setError(undefined);
            return;
        }
        const rejection = validate?.(entry);
        if (rejection) {
            // Keep the text so the user can correct it rather than retype it.
            setError(rejection);
            return;
        }
        setError(undefined);
        if (!values.includes(entry)) {
            onChange([...values, entry]);
        }
        setDraft('');
    };
    const removeAt = (index: number): void => onChange(values.filter((_, itemIndex) => itemIndex !== index));
    return <ul className='preference-array ai-config-array'>
        {values.map((value, index) => (
            <li className='preference-array-element' key={`${value}-${index}`}>
                <span className='preference-array-element-val'>{value}</span>
                <span
                    className='preference-array-element-btn remove-btn'
                    role='button'
                    tabIndex={0}
                    title={nls.localizeByDefault('Remove')}
                    onClick={() => { if (!disabled) { removeAt(index); } }}
                >
                    <i className={codicon('close')}></i>
                </span>
            </li>
        ))}
        <li className='ai-config-array-input-row'>
            <input
                className='preference-array-input theia-input'
                type='text'
                aria-label={ariaLabel}
                placeholder={addPlaceholder}
                spellCheck={false}
                value={draft}
                disabled={disabled}
                onChange={e => { setDraft(e.target.value); setError(undefined); }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
            />
            <span
                className={`preference-array-element-btn ${codicon('add')}`}
                role='button'
                tabIndex={0}
                title={nls.localizeByDefault('Add')}
                onClick={() => { if (!disabled) { addItem(); } }}
            ></span>
        </li>
        {error && <li className='ai-config-array-error'><span className='ai-config-input-error'>{error}</span></li>}
    </ul>;
};

/** A monospace path input plus a "Browse…" button that delegates folder selection to `onBrowse`. */
export const AiPathInput: React.FC<{
    value: string;
    placeholder: string;
    browseLabel: string;
    disabled?: boolean;
    onCommit: (value: string) => void;
    onBrowse: () => Promise<string | undefined>;
}> = ({ value, placeholder, browseLabel, disabled, onCommit, onBrowse }) => {
    const [draft, setDraft] = React.useState(value);
    React.useEffect(() => setDraft(value), [value]);
    const commitDraft = (): void => {
        if (draft !== value) {
            onCommit(draft);
        }
    };
    const browse = (): void => {
        onBrowse().then(picked => {
            if (picked !== undefined) {
                setDraft(picked);
                onCommit(picked);
            }
        });
    };
    return <div className='ai-config-path-row'>
        <input
            className='theia-input ai-config-input ai-config-input-mono'
            type='text'
            value={draft}
            placeholder={placeholder}
            disabled={disabled}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={e => { if (e.key === 'Enter') { commitDraft(); } }}
        />
        <button type='button' className='theia-button secondary' disabled={disabled} onClick={browse}>{browseLabel}</button>
    </div>;
};

/**
 * A button that hands editing off to the `settings.json` file. Used for preferences whose value is a
 * complex object (or array of objects) that cannot be edited meaningfully through an inline control;
 * clicking it opens `settings.json` focused on the preference, mirroring the Settings view's
 * "Edit in settings.json" link.
 */
export const AiEditInSettingsButton: React.FC<{
    label: string;
    ariaLabel: string;
    disabled?: boolean;
    onClick: () => void;
}> = ({ label, ariaLabel, disabled, onClick }) => (
    <button
        type='button'
        className='theia-button secondary ai-config-edit-in-settings'
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={onClick}
    >
        <span className={codicon('edit')}></span>
        {label}
    </button>
);

/** A single option for {@link AiEnumSelect}. */
export interface AiEnumOption {
    readonly value: string;
    readonly label: string;
    /** Optional native tooltip, e.g. to surface an option's secondary description. */
    readonly title?: string;
    readonly disabled?: boolean;
}

/**
 * A theme-styled select over a fixed set of options, backed by the shared {@link SelectComponent} so
 * that each option can surface its own description (which native `<option>` cannot) and the control
 * matches the Settings UI. Commits the selected value via `onCommit`.
 */
export const AiEnumSelect: React.FC<{
    value: string | undefined;
    options: AiEnumOption[];
    ariaLabel: string;
    className?: string;
    disabled?: boolean;
    invalid?: boolean;
    onCommit: (value: string) => void;
    // `ariaLabel` is intentionally not destructured: SelectComponent exposes no accessible-name prop yet.
}> = ({ value, options, className, disabled, invalid, onCommit }) => {
    // `title` becomes the per-option `description` shown by SelectComponent's dropdown.
    const selectOptions = React.useMemo<SelectOption[]>(() => options.map(option => ({
        value: option.value,
        label: option.label,
        description: option.title,
        disabled: option.disabled
    })), [options]);
    const handleChange = React.useCallback((option: SelectOption): void => {
        // SelectComponent has no whole-control `disabled`; guard the commit so a disabled select never writes.
        if (!disabled && option.value !== undefined) {
            onCommit(option.value);
        }
    }, [disabled, onCommit]);
    const componentClassName = `ai-config-select${invalid ? ' error' : ''}${disabled ? ' disabled' : ''}${className ? ' ' + className : ''}`;
    return <SelectComponent
        options={selectOptions}
        defaultValue={value}
        onChange={handleChange}
        className={componentClassName}
    />;
};

/** A single non-"Limited" choice for {@link AiSessionLimitControl}, mapping a label to its magic value. */
export interface SessionLimitSpecialOption {
    readonly value: number;
    readonly label: string;
}

/**
 * A plain numeric input for a session-limit preference. Any special sentinel values (e.g. -1 = unlimited,
 * 0 = don't persist) can be entered directly, instead of being hidden behind a separate
 * "Limited / Unlimited / …" dropdown; the preference description explains what they mean.
 */
export const AiSessionLimitControl: React.FC<{
    value: number;
    limitedMin: number;
    limitedMax?: number;
    specials: SessionLimitSpecialOption[];
    ariaLabel: string;
    disabled?: boolean;
    onCommit: (value: number) => void;
}> = ({ value, limitedMin, limitedMax, specials, ariaLabel, disabled, onCommit }) => {
    // Special sentinel values sit below the "limited" minimum, so the input has to allow entering them.
    const min = specials.reduce((smallest, special) => Math.min(smallest, special.value), limitedMin);
    return <AiNumberStepper
        value={value}
        ariaLabel={ariaLabel}
        // A session limit is a count, so it stays a whole number even though the stepper allows fractions.
        integer={true}
        min={min}
        max={limitedMax}
        disabled={disabled}
        onCommit={onCommit}
    />;
};
