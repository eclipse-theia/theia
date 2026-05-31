// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export interface QaapSegmentedOption<T extends string = string> {
    readonly id: T;
    readonly label: string;
}

export interface QaapSegmentedFieldController<T extends string = string> {
    readonly root: HTMLElement;
    readonly hiddenInput: HTMLInputElement;
    getValue(): T;
    setValue(value: T): void;
}

/** Mockup-style segmented control (`.seg` in qaap-agentic-mockups.html). */
export function createSegmentedField<T extends string>(options: {
    readonly label?: string;
    readonly segments: readonly QaapSegmentedOption<T>[];
    readonly value: T;
    readonly onChange?: (value: T) => void;
}): QaapSegmentedFieldController<T> {
    const root = document.createElement('div');
    root.className = 'theia-qaap-segmented-field';

    if (options.label) {
        const labelEl = document.createElement('div');
        labelEl.className = 'theia-qaap-segmented-label';
        labelEl.textContent = options.label;
        root.append(labelEl);
    }

    const bar = document.createElement('div');
    bar.className = 'theia-qaap-segmented-bar';
    bar.setAttribute('role', 'tablist');

    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'hidden';
    let current = options.value;
    hiddenInput.value = current;

    const buttons: HTMLButtonElement[] = [];

    const syncSelection = (): void => {
        for (const btn of buttons) {
            const selected = btn.dataset.segmentId === current;
            btn.classList.toggle('theia-mod-selected', selected);
            btn.setAttribute('aria-selected', selected ? 'true' : 'false');
        }
        hiddenInput.value = current;
    };

    for (const segment of options.segments) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theia-qaap-segmented-option';
        btn.dataset.segmentId = segment.id;
        btn.textContent = segment.label;
        btn.setAttribute('role', 'tab');
        btn.addEventListener('click', () => {
            if (current === segment.id) {
                return;
            }
            current = segment.id;
            syncSelection();
            options.onChange?.(current);
        });
        buttons.push(btn);
        bar.append(btn);
    }

    syncSelection();
    root.append(bar, hiddenInput);

    return {
        root,
        hiddenInput,
        getValue: () => current,
        setValue: value => {
            current = value;
            syncSelection();
        },
    };
}

export function createFormFieldLabel(text: string): HTMLElement {
    const label = document.createElement('div');
    label.className = 'theia-qaap-form-field-label';
    label.textContent = text;
    return label;
}
