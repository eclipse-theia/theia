// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { appendAgentBrandIcon, createAgentBrandIcon, resolveAgentBrand } from '../common/qaap-agent-branding';

export type QaapAgentUiSize = 'sm' | 'md';

export interface QaapAgentOption {
    readonly id: string;
    readonly label: string;
}

export interface QaapAgentChipOptions {
    readonly agentId: string;
    readonly label?: string;
    readonly selected?: boolean;
    readonly disabled?: boolean;
    readonly onClick?: () => void;
}

export interface QaapAgentPickerController {
    readonly root: HTMLElement;
    readonly hiddenInput: HTMLInputElement;
    getSelectedId(): string;
    setSelectedId(agentId: string): void;
    setAgents(agents: readonly QaapAgentOption[]): void;
}

export interface QaapAgentSelectFieldController {
    readonly root: HTMLElement;
    readonly select: HTMLSelectElement;
    getSelectedId(): string;
    setAgents(agents: readonly QaapAgentOption[], selectedId: string | undefined): void;
}

export function resolveAgentDisplayLabel(agentId: string, fallbackLabel?: string): string {
    return resolveAgentBrand(agentId)?.label ?? fallbackLabel ?? agentId;
}

/** Toggle or static chip with brand icon + label. */
export function createAgentBrandChip(options: QaapAgentChipOptions): HTMLElement {
    const label = options.label ?? resolveAgentDisplayLabel(options.agentId);
    const el = options.onClick ? document.createElement('button') : document.createElement('span');
    el.className = 'theia-qaap-agent-chip';
    if (options.onClick) {
        (el as HTMLButtonElement).type = 'button';
    }
    if (options.selected) {
        el.classList.add('theia-mod-selected');
    }
    if (options.disabled) {
        el.classList.add('theia-mod-disabled');
        if (options.onClick) {
            (el as HTMLButtonElement).disabled = true;
        }
    }
    appendAgentBrandIcon(el, options.agentId, 'sm');
    const text = document.createElement('span');
    text.className = 'theia-qaap-agent-chip-label';
    text.textContent = label;
    el.append(text);
    if (options.onClick && !options.disabled) {
        el.addEventListener('click', options.onClick);
    }
    return el;
}

/** Bottom-sheet row for agent pickers. */
export function createAgentSheetOptionButton(options: {
    readonly agentId: string;
    readonly label: string;
    readonly selected?: boolean;
    readonly submenuChevron?: 'collapsed' | 'expanded' | 'forward';
    readonly onSelect: () => void;
}): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theia-mobile-sticky-composer-sheet-option theia-qaap-agent-sheet-option';
    if (options.selected) {
        btn.classList.add('theia-mod-selected');
    }
    const content = document.createElement('span');
    content.className = 'theia-mobile-sticky-composer-sheet-option-content';
    appendAgentBrandIcon(content, options.agentId, 'sm');
    const labelEl = document.createElement('span');
    labelEl.className = 'theia-mobile-sticky-composer-sheet-option-label';
    labelEl.textContent = options.label;
    content.append(labelEl);
    if (options.selected) {
        const check = document.createElement('span');
        check.className = 'codicon codicon-check theia-mobile-sticky-composer-sheet-option-check';
        check.setAttribute('aria-hidden', 'true');
        content.append(check);
    }
    if (options.submenuChevron) {
        const chevron = document.createElement('span');
        const icon = options.submenuChevron === 'expanded'
            ? 'codicon-chevron-down'
            : 'codicon-chevron-right';
        chevron.className = `codicon ${icon} theia-mobile-sticky-composer-sheet-option-chevron`;
        chevron.setAttribute('aria-hidden', 'true');
        content.append(chevron);
    }
    btn.append(content);
    btn.addEventListener('click', options.onSelect);
    return btn;
}

/** Picker row for model lists (no agent brand icon). */
export function createPickerSheetOptionButton(options: {
    readonly label: string;
    readonly selected?: boolean;
    readonly onSelect: () => void;
}): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theia-mobile-sticky-composer-sheet-option theia-qaap-picker-sheet-option';
    if (options.selected) {
        btn.classList.add('theia-mod-selected');
    }
    const content = document.createElement('span');
    content.className = 'theia-mobile-sticky-composer-sheet-option-content';
    const labelEl = document.createElement('span');
    labelEl.className = 'theia-mobile-sticky-composer-sheet-option-label';
    labelEl.textContent = options.label;
    content.append(labelEl);
    if (options.selected) {
        const check = document.createElement('span');
        check.className = 'codicon codicon-check theia-mobile-sticky-composer-sheet-option-check';
        check.setAttribute('aria-hidden', 'true');
        content.append(check);
    }
    btn.append(content);
    btn.addEventListener('click', options.onSelect);
    return btn;
}

/** Sticky composer toolbar agent button — brand icon + optional model id (agent name is aria/title only). */
export function populateAgentToolbarButton(
    button: HTMLButtonElement,
    options: { readonly agentId: string; readonly label: string; readonly modelLabel?: string },
): void {
    button.replaceChildren();
    const chevron = document.createElement('span');
    chevron.className = 'codicon codicon-chevron-down';
    chevron.setAttribute('aria-hidden', 'true');
    const model = options.modelLabel?.trim();
    if (model) {
        const identity = document.createElement('span');
        identity.className = 'theia-mobile-projects-sticky-composer-agent-identity';
        appendAgentBrandIcon(identity, options.agentId, 'sm');
        const labelEl = document.createElement('span');
        labelEl.className = 'theia-mobile-projects-sticky-composer-agent-label';
        labelEl.textContent = model;
        identity.append(labelEl);
        button.append(identity, chevron);
        button.classList.remove('theia-mod-logo-only');
    } else {
        appendAgentBrandIcon(button, options.agentId, 'sm');
        button.append(chevron);
        button.classList.add('theia-mod-logo-only');
    }
}

/** Task foot / inbox agent badge. */
export function createAgentTaskBadge(options: {
    readonly agentId: string;
    readonly label: string;
    readonly labelColor?: string;
}): HTMLElement {
    const badge = document.createElement('span');
    badge.className = 'theia-mobile-projects-task-agent theia-qaap-agent-task-badge';
    appendAgentBrandIcon(badge, options.agentId, 'sm');
    const text = document.createElement('span');
    text.className = 'theia-mobile-projects-task-agent-label';
    if (options.labelColor) {
        text.style.color = options.labelColor;
    }
    text.textContent = options.label;
    badge.append(text);
    return badge;
}

/** Inline meta badge (team hub subtitle, routine cards). */
export function createAgentMetaBadge(agentId: string, label?: string): HTMLElement {
    const badge = document.createElement('span');
    badge.className = 'theia-qaap-agent-meta-badge';
    appendAgentBrandIcon(badge, agentId, 'sm');
    const text = document.createElement('span');
    text.className = 'theia-qaap-agent-meta-badge-label';
    text.textContent = label ?? resolveAgentDisplayLabel(agentId);
    badge.append(text);
    return badge;
}

/** Team hub row avatar — brand icon with optional activity ring. */
export function createAgentRowAvatar(options: {
    readonly agentId: string;
    readonly state: 'running' | 'streaming' | 'failed' | 'idle';
    readonly nested?: boolean;
}): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = `theia-qaap-agent-row-avatar theia-mod-${options.state}`;
    if (options.nested) {
        wrap.classList.add('theia-mod-nested');
    }
    const icon = createAgentBrandIcon(options.agentId, options.nested ? 'sm' : 'md');
    if (icon) {
        wrap.append(icon);
    }
    if (options.state === 'running' || options.state === 'streaming') {
        const ring = document.createElement('span');
        ring.className = 'theia-qaap-agent-row-avatar-ring';
        ring.setAttribute('aria-hidden', 'true');
        wrap.append(ring);
    }
    return wrap;
}

/** Visual chip grid picker for forms (routines, parallel runs). */
export function createAgentPickerField(options: {
    readonly label?: string;
    readonly agents: readonly QaapAgentOption[];
    readonly selectedId: string | undefined;
    readonly onChange?: (agentId: string) => void;
}): QaapAgentPickerController {
    const root = document.createElement('div');
    root.className = 'theia-qaap-agent-picker-field';

    if (options.label) {
        const labelEl = document.createElement('div');
        labelEl.className = 'theia-qaap-agent-picker-label';
        labelEl.textContent = options.label;
        root.append(labelEl);
    }

    const chipsHost = document.createElement('div');
    chipsHost.className = 'theia-qaap-agent-picker-chips';

    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'hidden';
    hiddenInput.name = 'qaap-agent-id';

    let agents = [...options.agents];
    let selectedId = options.selectedId ?? agents[0]?.id ?? '';
    hiddenInput.value = selectedId;

    const renderChips = (): void => {
        chipsHost.replaceChildren();
        if (agents.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'theia-qaap-agent-picker-empty';
            empty.textContent = '—';
            chipsHost.append(empty);
            return;
        }
        for (const agent of agents) {
            chipsHost.append(createAgentBrandChip({
                agentId: agent.id,
                label: agent.label,
                selected: agent.id === selectedId,
                onClick: () => {
                    selectedId = agent.id;
                    hiddenInput.value = selectedId;
                    renderChips();
                    options.onChange?.(selectedId);
                },
            }));
        }
    };

    renderChips();
    root.append(chipsHost, hiddenInput);

    return {
        root,
        hiddenInput,
        getSelectedId: () => selectedId,
        setSelectedId: agentId => {
            selectedId = agentId;
            hiddenInput.value = agentId;
            renderChips();
        },
        setAgents: nextAgents => {
            agents = [...nextAgents];
            if (!agents.some(a => a.id === selectedId)) {
                selectedId = agents[0]?.id ?? '';
                hiddenInput.value = selectedId;
            }
            renderChips();
        },
    };
}

/** Compact select + leading icon (mini composer). */
export function createAgentSelectField(options: {
    readonly className?: string;
    readonly ariaLabel: string;
    readonly onChange?: (agentId: string) => void;
}): QaapAgentSelectFieldController {
    const root = document.createElement('div');
    root.className = 'theia-qaap-agent-select-field';

    const iconHost = document.createElement('span');
    iconHost.className = 'theia-qaap-agent-select-icon';

    const select = document.createElement('select');
    select.className = options.className ?? 'theia-qaap-agent-select';
    select.setAttribute('aria-label', options.ariaLabel);

    const syncIcon = (agentId: string): void => {
        iconHost.replaceChildren();
        const icon = createAgentBrandIcon(agentId, 'sm');
        if (icon) {
            iconHost.append(icon);
        }
    };

    select.addEventListener('change', () => {
        syncIcon(select.value);
        options.onChange?.(select.value);
    });

    root.append(iconHost, select);

    return {
        root,
        select,
        getSelectedId: () => select.value,
        setAgents: (agents, selectedId) => {
            select.replaceChildren();
            for (const agent of agents) {
                const option = document.createElement('option');
                option.value = agent.id;
                option.textContent = agent.label;
                select.append(option);
            }
            const resolved = selectedId && agents.some(a => a.id === selectedId)
                ? selectedId
                : (agents[0]?.id ?? '');
            select.value = resolved;
            select.hidden = agents.length <= 1;
            select.disabled = agents.length <= 1;
            iconHost.hidden = agents.length <= 1;
            syncIcon(resolved);
        },
    };
}

export function appendSubtitleMetaPart(parent: HTMLElement, part: HTMLElement | string): void {
    if (parent.childElementCount > 0) {
        const sep = document.createElement('span');
        sep.className = 'theia-qaap-agent-meta-sep';
        sep.textContent = '·';
        sep.setAttribute('aria-hidden', 'true');
        parent.append(sep);
    }
    if (typeof part === 'string') {
        const text = document.createElement('span');
        text.className = 'theia-qaap-agent-meta-text';
        text.textContent = part;
        parent.append(text);
    } else {
        parent.append(part);
    }
}

/** Mockup-style diff stats (+128 −18). */
export function createDiffStatsLine(options: {
    readonly added?: number;
    readonly removed?: number;
    readonly fileCount?: number;
}): HTMLElement {
    const line = document.createElement('span');
    line.className = 'theia-qaap-diff-stats';
    const parts: HTMLElement[] = [];
    if ((options.added ?? 0) > 0 || (options.removed ?? 0) > 0) {
        const added = document.createElement('span');
        added.className = 'theia-qaap-diff-stats-added';
        added.textContent = `+${options.added ?? 0}`;
        parts.push(added);
        const removed = document.createElement('span');
        removed.className = 'theia-qaap-diff-stats-removed';
        removed.textContent = `−${options.removed ?? 0}`;
        parts.push(removed);
    }
    if ((options.fileCount ?? 0) > 0) {
        const files = document.createElement('span');
        files.className = 'theia-qaap-diff-stats-files';
        files.textContent = `${options.fileCount} files`;
        parts.push(files);
    }
    if (parts.length === 0) {
        line.textContent = '—';
        return line;
    }
    for (let i = 0; i < parts.length; i++) {
        if (i > 0) {
            const sep = document.createElement('span');
            sep.className = 'theia-qaap-diff-stats-sep';
            sep.textContent = ' ';
            line.append(sep);
        }
        line.append(parts[i]);
    }
    return line;
}

/** Parallel run variant card (mockup `.variant` row). */
export function createParallelVariantCard(options: {
    readonly agentId: string;
    readonly title: string;
    readonly meta?: HTMLElement | string;
    readonly state: 'running' | 'failed' | 'idle';
    readonly selected?: boolean;
    readonly chooseLabel?: string;
    readonly chooseDisabled?: boolean;
    readonly onChoose?: () => void;
}): HTMLElement {
    const row = document.createElement('div');
    row.className = 'theia-qaap-parallel-variant-card';
    if (options.selected) {
        row.classList.add('theia-mod-selected');
    }
    row.append(createAgentRowAvatar({
        agentId: options.agentId,
        state: options.state === 'idle' ? 'idle' : options.state === 'failed' ? 'failed' : 'running',
    }));
    const body = document.createElement('div');
    body.className = 'theia-qaap-parallel-variant-body';
    const title = document.createElement('div');
    title.className = 'theia-qaap-parallel-variant-title';
    title.textContent = options.title;
    const meta = document.createElement('div');
    meta.className = 'theia-qaap-parallel-variant-meta';
    if (typeof options.meta === 'string') {
        meta.textContent = options.meta;
    } else if (options.meta) {
        meta.append(options.meta);
    } else {
        meta.textContent = '—';
    }
    body.append(title, meta);
    row.append(body);
    if (options.onChoose) {
        const choose = document.createElement('button');
        choose.type = 'button';
        choose.className = 'theia-qaap-parallel-variant-choose';
        choose.textContent = options.chooseLabel ?? 'Choose';
        choose.disabled = options.chooseDisabled ?? false;
        choose.addEventListener('click', ev => {
            ev.stopPropagation();
            options.onChoose?.();
        });
        row.append(choose);
    }
    return row;
}
