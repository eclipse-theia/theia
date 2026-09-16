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

// @lumino/dragdrop (pulled in transitively via `codicon` from `@theia/core/lib/browser`) extends the
// DragEvent DOM global at module load, which JSDOM does not provide; stub it so the import succeeds.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (!(global as any).DragEvent) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).DragEvent = class DragEvent extends (global as any).Event { };
}

import { expect } from 'chai';
import * as React from '@theia/core/shared/react';
import { flushSync } from '@theia/core/shared/react-dom';
import { createRoot } from '@theia/core/shared/react-dom/client';
import { AiConfigurationItemRow } from './ai-configuration-item-row';
import { AiConfigurationEmptyState, AiConfigurationItemDetailHeader, AiConfigurationSection } from './ai-configuration-primitives';
import { AiConfigurationOrigin, AiConfigurationOriginBadge, AiConfigurationOriginBadges } from './ai-configuration-origin-badge';
import { AiConfigurationSettingRow } from './ai-configuration-setting-row';
import { AiArrayInput, AiNumberStepper } from './ai-configuration-controls';
import { ConfirmDialog } from '@theia/core/lib/browser';
import { PromptCustomizationDialogs } from './prompt-customization-dialogs';
import { VariantSetCard } from './variant-set-card';
import { AiSettingsRowService } from './ai-settings-row-service';
import { PromptFragment, PromptService } from '@theia/ai-core/lib/common/prompt-service';

disableJSDOM();

/** Replaces the (single) input's text the way a keystroke does, and flushes the resulting render. */
function typeInto(container: HTMLElement, value: string): void {
    const input = container.querySelector<HTMLInputElement>('input')!;
    // JSDOM only accepts events built from its own window's constructor, not Node's global `Event`.
    const view = container.ownerDocument.defaultView as unknown as { Event: typeof Event; HTMLInputElement: typeof HTMLInputElement };
    // Assigning `value` directly goes through React's patched setter, which then treats the change as
    // already handled and never calls `onChange`; the prototype's setter is what a real keystroke uses.
    const nativeSetter = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'value')!.set!;
    flushSync(() => {
        nativeSetter.call(input, value);
        input.dispatchEvent(new view.Event('input', { bubbles: true }));
    });
}

/** Renders one level of an element: the output of a function component, or the children of a host element. */
function contentOf(element: React.ReactElement): React.ReactNode {
    if (typeof element.type === 'function') {
        return (element.type as (props: unknown) => React.ReactNode)(element.props);
    }
    return (element.props as { children?: React.ReactNode } | undefined)?.children;
}

/** Recursively collects the class names present anywhere in a rendered element tree. */
function classNames(node: React.ReactNode, into: string[] = []): string[] {
    if (!node || typeof node !== 'object') {
        return into;
    }
    if (Array.isArray(node)) {
        node.forEach(child => classNames(child, into));
        return into;
    }
    const element = node as React.ReactElement<{ className?: string }>;
    if (element.props?.className) {
        into.push(...element.props.className.split(/\s+/).filter(Boolean));
    }
    classNames(contentOf(element), into);
    return into;
}

/** Recursively collects the string text present anywhere in a rendered element tree. */
function textOf(node: React.ReactNode, into: string[] = []): string[] {
    if (node === undefined || node === false) {
        return into;
    }
    if (typeof node === 'string' || typeof node === 'number') {
        into.push(String(node));
        return into;
    }
    if (Array.isArray(node)) {
        node.forEach(child => textOf(child, into));
        return into;
    }
    if (typeof node === 'object') {
        textOf(contentOf(node as React.ReactElement), into);
    }
    return into;
}

describe('AI Configuration primitives', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    /** Renders a component into a detached container; the caller disposes it. */
    function mount(element: React.ReactElement): { container: HTMLElement; dispose: () => void } {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => root.render(element));
        return { container, dispose: () => { flushSync(() => root.unmount()); container.remove(); } };
    }

    it('AiConfigurationSection renders its title and children', () => {
        const { container, dispose } = mount(React.createElement(AiConfigurationSection,
            { title: 'General', children: React.createElement('span', {}, 'row') }));
        try {
            expect(Boolean(container.querySelector('.ai-configuration-section'))).to.equal(true);
            expect(container.textContent).to.include('General').and.to.include('row');
            // Not foldable unless asked: no chevron, and the content is not gated behind one.
            expect(Boolean(container.querySelector('.ai-configuration-section-chevron'))).to.equal(false);
        } finally {
            dispose();
        }
    });

    it('AiConfigurationSection shows an entry count next to the title', () => {
        const { container, dispose } = mount(React.createElement(AiConfigurationSection,
            { title: 'Skills', count: 14, children: React.createElement('span', {}, 'row') }));
        try {
            expect(container.querySelector('.ai-configuration-section-count')?.textContent).to.equal('14');
        } finally {
            dispose();
        }
    });

    it('AiConfigurationSection folds its content away when collapsible, starting expanded', () => {
        const { container, dispose } = mount(React.createElement(AiConfigurationSection,
            { title: 'Skills', collapsible: true, children: React.createElement('span', {}, 'row') }));
        try {
            const header = container.querySelector<HTMLElement>('.ai-configuration-section-title.foldable');
            // Browsing pages open showing their content; folding is the user's choice.
            expect(header?.getAttribute('aria-expanded')).to.equal('true');
            expect(container.textContent).to.include('row');

            flushSync(() => header!.click());
            expect(header!.getAttribute('aria-expanded')).to.equal('false');
            expect(container.textContent).to.not.include('row');
        } finally {
            dispose();
        }
    });

    it('AiConfigurationSection keeps a folded section open while forced, so a filter match stays reachable', () => {
        const { container, dispose } = mount(React.createElement(AiConfigurationSection,
            { title: 'Skills', collapsible: true, forceExpanded: true, children: React.createElement('span', {}, 'row') }));
        try {
            const header = container.querySelector<HTMLElement>('.ai-configuration-section-title.foldable');
            flushSync(() => header!.click());
            expect(container.textContent).to.include('row');
        } finally {
            dispose();
        }
    });

    it('AiConfigurationItemRow exposes the label, status and an onSelect handler', () => {
        let selected = false;
        const tree = AiConfigurationItemRow({
            label: 'Universal',
            iconClass: 'codicon-copilot',
            status: { kind: 'on', label: 'Enabled' },
            onSelect: () => { selected = true; }
        }) as React.ReactElement<{ onClick: () => void }>;
        expect(textOf(tree)).to.include('Universal').and.to.include('Enabled');
        expect(classNames(tree)).to.include('ai-configuration-status-on');
        tree.props.onClick();
        expect(selected).to.equal(true);
    });

    it('AiConfigurationItemRow shows the modified bar and a gear that anchors its menu at the gear', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        const opened: HTMLElement[] = [];
        flushSync(() => root.render(React.createElement(AiConfigurationItemRow, {
            label: 'chat',
            modified: true,
            onOpenMenu: gearEl => { opened.push(gearEl); }
        })));
        const row = host.querySelector('.ai-configuration-item-row') as HTMLElement;
        expect(row.classList.contains('modified')).to.equal(true);
        // A non-navigable row (no onSelect) shows no chevron.
        expect(Boolean(host.querySelector('.ai-configuration-item-row-chevron'))).to.equal(false);
        const gear = host.querySelector('.ai-settings-row-gear') as HTMLButtonElement;
        expect(Boolean(gear)).to.equal(true);
        flushSync(() => gear.click());
        expect(opened.length).to.equal(1);
        expect(opened[0]).to.equal(gear);
        root.unmount();
        host.remove();
    });

    /**
     * JSDOM lays nothing out, so every element reports a zero height and a description would never measure as
     * clamped. Fakes the two heights the row compares, which is exactly the browser's "the text does not fit"
     * signal, and restores them afterwards.
     */
    function withClampedText(scrollHeight: number, run: () => void): void {
        // Both live on `Element.prototype`, which is where JSDOM defines them.
        const prototype = document.defaultView!.Element.prototype;
        const original = {
            scrollHeight: Object.getOwnPropertyDescriptor(prototype, 'scrollHeight')!,
            clientHeight: Object.getOwnPropertyDescriptor(prototype, 'clientHeight')!
        };
        Object.defineProperty(prototype, 'scrollHeight', { configurable: true, get: () => scrollHeight });
        Object.defineProperty(prototype, 'clientHeight', { configurable: true, get: () => 40 });
        try {
            run();
        } finally {
            Object.defineProperty(prototype, 'scrollHeight', original.scrollHeight);
            Object.defineProperty(prototype, 'clientHeight', original.clientHeight);
        }
    }

    it('AiConfigurationItemRow expands a description that does not fit, and leaves a fitting one alone', () => {
        // A tool description running past the two-line clamp is otherwise unreadable in the list.
        withClampedText(120, () => {
            let rowOpened = 0;
            const { container, dispose } = mount(React.createElement(AiConfigurationItemRow, {
                label: 'writeFileReplacements',
                description: 'Replace text in a file. The old text must be unique in the file.',
                onSelect: () => { rowOpened++; }
            }));
            try {
                const description = container.querySelector('.ai-configuration-item-row-description') as HTMLElement;
                expect(description.classList.contains('expanded')).to.equal(false);
                const toggle = container.querySelector('.ai-configuration-item-row-description-toggle') as HTMLButtonElement;
                expect(Boolean(toggle)).to.equal(true);
                expect(toggle.getAttribute('aria-expanded')).to.equal('false');

                flushSync(() => toggle.click());
                expect(description.classList.contains('expanded')).to.equal(true);
                expect(container.querySelector('.ai-configuration-item-row-description-toggle')!.getAttribute('aria-expanded')).to.equal('true');
                // Reading the description must not also open the row's detail page.
                expect(rowOpened).to.equal(0);
            } finally {
                dispose();
            }
        });
        // Nothing hidden, so no toggle to offer.
        withClampedText(40, () => {
            const { container, dispose } = mount(React.createElement(AiConfigurationItemRow, { label: 'readFile', description: 'Read a file.' }));
            try {
                expect(Boolean(container.querySelector('.ai-configuration-item-row-description-toggle'))).to.equal(false);
            } finally {
                dispose();
            }
        });
    });

    it('AiConfigurationEmptyState renders the message and an optional action', async () => {
        const tree = await AiConfigurationEmptyState({ message: 'Nothing here', action: React.createElement('button', {}, 'Add') });
        expect(textOf(tree)).to.include('Nothing here').and.to.include('Add');
    });

    it('AiConfigurationItemDetailHeader renders title and subtitle', async () => {
        const tree = await AiConfigurationItemDetailHeader({ title: 'Coder', subtitle: 'agent-id-1' });
        expect(textOf(tree)).to.include('Coder').and.to.include('agent-id-1');
    });

    it('AiConfigurationOriginBadge is a button that activates its origin, and does not open the row it sits in', () => {
        let activated = 0;
        let rowOpened = 0;
        const { container, dispose } = mount(React.createElement('div', { onClick: () => { rowOpened++; } },
            React.createElement(AiConfigurationOriginBadge, {
                origin: { label: 'From registry', iconClass: 'codicon-link-external', tooltip: 'Open in AI registry: x', activate: () => { activated++; } }
            })));
        try {
            const badge = container.querySelector('button.ai-configuration-origin-badge') as HTMLButtonElement;
            expect(badge.getAttribute('title')).to.equal('Open in AI registry: x');
            expect(badge.textContent).to.include('From registry');

            flushSync(() => badge.click());
            expect(activated).to.equal(1);
            // The surrounding row and detail header are clickable themselves; following the badge must
            // not also open them.
            expect(rowOpened).to.equal(0);
        } finally {
            dispose();
        }
    });

    it('AiConfigurationOriginBadge is not focusable when the origin leads nowhere', () => {
        const { container, dispose } = mount(React.createElement(AiConfigurationOriginBadge, {
            origin: { label: 'via Acme', iconClass: 'codicon-package', tooltip: 'Acme' }
        }));
        try {
            expect(container.querySelector('button')).to.be.null;
            expect(container.querySelector('span.ai-configuration-origin-badge')?.textContent).to.include('via Acme');
        } finally {
            dispose();
        }
    });

    it('AiConfigurationOriginBadges renders one badge per origin, in order, and nothing without any', () => {
        const origin = (label: string) => ({ label, iconClass: 'codicon-link-external', tooltip: label, activate: () => { } });
        const { container, dispose } = mount(React.createElement(AiConfigurationOriginBadges,
            { origins: [origin('From registry'), origin('via Acme Devtools')] }));
        try {
            expect(Array.from(container.querySelectorAll('.ai-configuration-origin-badge')).map(badge => badge.textContent))
                .to.deep.equal(['From registry', 'via Acme Devtools']);
        } finally {
            dispose();
        }
        const empty = mount(React.createElement('div', {}, React.createElement(AiConfigurationOriginBadges, { origins: [] })));
        try {
            expect(empty.container.querySelector('.ai-configuration-origin-badges')).to.be.null;
        } finally {
            empty.dispose();
        }
    });

    it('AiConfigurationOrigin builds the same registry and Agent Plugin badges for every page to use', () => {
        const registry = AiConfigurationOrigin.registry('io.github.acme/validator', () => { });
        expect(registry.label).to.equal('From registry');
        expect(registry.iconClass).to.contain('codicon-link-external');
        expect(registry.tooltip).to.contain('io.github.acme/validator');

        const plugin = AiConfigurationOrigin.agentPlugin({ pluginId: 'io.github.acme/devtools', name: 'Acme Devtools' }, () => { });
        expect(plugin.label).to.equal('via Acme Devtools');
        expect(plugin.iconClass).to.contain('codicon-package');
        expect(plugin.tooltip).to.contain('Acme Devtools');
    });

    it('AiConfigurationSettingRow renders title and control, marks modified rows, and hides the raw id', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        flushSync(() => root.render(React.createElement(AiConfigurationSettingRow, {
            preferenceId: 'ai-features.demo',
            title: 'Demo',
            renderMarkdown: () => document.createElement('div'),
            modified: true,
            control: React.createElement('span', {}, 'ctrl')
        })));
        const row = host.querySelector('.ai-settings-row') as HTMLElement;
        expect(row.classList.contains('modified')).to.equal(true);
        expect(row.textContent).to.include('Demo').and.to.include('ctrl');
        // The raw preference id is no longer shown inline; it is copied through the gear menu instead.
        expect(row.textContent).to.not.include('ai-features.demo');
        flushSync(() => root.render(React.createElement(AiConfigurationSettingRow, {
            preferenceId: 'ai-features.demo',
            title: 'Demo',
            renderMarkdown: () => document.createElement('div'),
            modified: false
        })));
        expect((host.querySelector('.ai-settings-row') as HTMLElement).classList.contains('modified')).to.equal(false);
        root.unmount();
        host.remove();
    });

    it('the setting-row gear delegates to the preference context menu, anchored at the gear', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        const opened: HTMLElement[] = [];
        flushSync(() => root.render(React.createElement(AiConfigurationSettingRow, {
            preferenceId: 'ai-features.demo',
            title: 'Demo',
            renderMarkdown: () => document.createElement('div'),
            modified: true,
            onOpenMenu: gearEl => { opened.push(gearEl); },
            control: React.createElement('span', {}, 'ctrl')
        })));

        // The gear defers to the owner's opener (which renders the Settings UI's own preference context
        // menu via ContextMenuRenderer), passing the gear element as the anchor. No inline popover.
        const gear = host.querySelector('.ai-settings-row-gear') as HTMLButtonElement;
        expect(Boolean(gear)).to.equal(true);
        flushSync(() => gear.click());
        expect(opened.length).to.equal(1);
        expect(opened[0]).to.equal(gear);

        root.unmount();
        host.remove();
    });

    it('AiConfigurationSettingRow hides the gear when no menu opener is provided', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        flushSync(() => root.render(React.createElement(AiConfigurationSettingRow, {
            preferenceId: 'ai-features.demo',
            title: 'Demo',
            renderMarkdown: () => document.createElement('div'),
            modified: true
        })));
        expect(Boolean(host.querySelector('.ai-settings-row-gear'))).to.equal(false);
        root.unmount();
        host.remove();
    });

    it('AiConfigurationSettingRow places a full-width control in the below slot', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        flushSync(() => root.render(React.createElement(AiConfigurationSettingRow, {
            preferenceId: 'ai-features.demo',
            title: 'Demo',
            renderMarkdown: () => document.createElement('div'),
            modified: false,
            below: React.createElement('span', {}, 'wide')
        })));
        expect(Boolean(host.querySelector('.ai-settings-row-below'))).to.equal(true);
        expect(host.textContent).to.include('wide');
        root.unmount();
        host.remove();
    });
});

describe('PromptCustomizationDialogs', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    function promptServiceWith(fragments: Record<string, Partial<PromptFragment>[]>): PromptService {
        const map = new Map<string, PromptFragment[]>(
            Object.entries(fragments).map(([id, list]) => [id, list.map(fragment => ({ id, template: '', ...fragment }) as PromptFragment)])
        );
        return {
            getAllPromptFragments: () => map,
            getRawPromptFragment: (id: string) => map.get(id)?.[0]
        } as unknown as PromptService;
    }

    it('reports a built-in behind a customized fragment, so the action can reset', () => {
        const promptService = promptServiceWith({
            'coder-system-agent-mode': [{ customizationId: 'user', priority: 1 }, {}]
        });

        expect(PromptCustomizationDialogs.hasBuiltIn(promptService, 'coder-system-agent-mode')).to.equal(true);
    });

    it('reports no built-in for a user-authored variant, whose reset would silently do nothing', () => {
        // A file named after the variant set becomes a custom variant of it; `PromptService.resetToBuiltIn`
        // is a no-op without a built-in, so the caller has to delete the customization instead.
        const promptService = promptServiceWith({
            'coder-system-agent-mode-nina': [{ customizationId: 'promptTemplateFolder', priority: 1 }]
        });

        expect(PromptCustomizationDialogs.hasBuiltIn(promptService, 'coder-system-agent-mode-nina')).to.equal(false);
    });

    it('does not prompt for a fragment that carries no customization to remove', async () => {
        let removed = false;
        const promptService = promptServiceWith({ 'coder-system': [{}] });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (promptService as any).removeCustomization = () => { removed = true; };

        const result = await PromptCustomizationDialogs.confirmAndRemove(promptService, 'coder-system', {
            title: 'Remove',
            message: () => 'Remove?'
        });

        expect(result).to.equal(false);
        expect(removed).to.equal(false);
    });

    it('removes the customization the effective fragment came from, after confirmation', async () => {
        const promptService = promptServiceWith({
            'coder-system-agent-mode-nina': [{ customizationId: 'promptTemplateFolder', priority: 1 }]
        });
        const removals: string[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Object.assign(promptService as any, {
            getCustomizationType: async () => 'Prompt Templates Folder',
            getCustomizationDescription: async () => 'file:///prompts/coder-system-agent-mode-nina.prompttemplate',
            removeCustomization: async (id: string, customizationId: string) => { removals.push(`${id}/${customizationId}`); }
        });
        let shownMessage: string | undefined;
        // Auto-confirm the dialog: it resolves through `ConfirmDialog.open`, which needs a real accept click.
        const originalOpen = ConfirmDialog.prototype.open;
        ConfirmDialog.prototype.open = async function (this: ConfirmDialog): Promise<boolean> {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            shownMessage = (this as any).contentNode?.textContent;
            return true;
        };
        try {
            const result = await PromptCustomizationDialogs.confirmAndRemove(promptService, 'coder-system-agent-mode-nina', {
                title: 'Remove Prompt Template',
                message: ({ type, description }) => `${type} :: ${description}`
            });

            expect(result).to.equal(true);
            expect(removals).to.deep.equal(['coder-system-agent-mode-nina/promptTemplateFolder']);
            // The dialog names where the customization lives, so the user sees which file goes away.
            expect(shownMessage).to.include('Prompt Templates Folder');
            expect(shownMessage).to.include('coder-system-agent-mode-nina.prompttemplate');
        } finally {
            ConfirmDialog.prototype.open = originalOpen;
        }
    });
});

describe('VariantSetCard', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    /** A set with a built-in default plus a user-authored variant, which is the one currently selected. */
    function setup(): { promptService: PromptService; selections: Array<[string, string]>; removals: string[] } {
        const fragments = new Map<string, PromptFragment[]>([
            ['coder-system-agent-mode', [{ id: 'coder-system-agent-mode', template: '' }]],
            ['coder-system-agent-mode-nina', [{ id: 'coder-system-agent-mode-nina', template: '', customizationId: 'folder', priority: 1 } as PromptFragment]]
        ]);
        const selections: Array<[string, string]> = [];
        const removals: string[] = [];
        let selected: string | undefined = 'coder-system-agent-mode-nina';
        const promptService = {
            getVariantIds: () => ['coder-system-agent-mode', 'coder-system-agent-mode-nina'],
            getDefaultVariantId: () => 'coder-system-agent-mode',
            getSelectedVariantId: () => selected,
            onSelectedVariantChange: () => ({ dispose: () => { } }),
            getAllPromptFragments: () => fragments,
            getRawPromptFragment: (id: string) => fragments.get(id)?.[0],
            getCustomizationType: async () => 'Prompt Templates Folder',
            getCustomizationDescription: async () => 'file:///prompts/coder-system-agent-mode-nina.prompttemplate',
            removeCustomization: async (id: string) => { removals.push(id); fragments.delete(id); },
            updateSelectedVariantId: async (agentId: string, _setId: string, variantId: string) => {
                selections.push([agentId, variantId]);
                selected = variantId;
            }
        } as unknown as PromptService;
        return { promptService, selections, removals };
    }

    function render(promptService: PromptService): { container: HTMLElement; dispose: () => void } {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => root.render(React.createElement(VariantSetCard, {
            agentId: 'coder',
            promptVariantSetId: 'coder-system-agent-mode',
            promptService,
            settingsRowService: { openResetMenu: () => { } } as unknown as AiSettingsRowService
        })));
        return { container, dispose: () => { flushSync(() => root.unmount()); container.remove(); } };
    }

    it('offers deletion, not a dead reset, for a selected variant that only exists as a user file', () => {
        const { promptService } = setup();
        const { container, dispose } = render(promptService);
        try {
            // `PromptService.resetToBuiltIn` is a no-op without a built-in, so the action must be a delete.
            expect(Boolean(container.querySelector('.codicon-trash'))).to.equal(true);
            expect(Boolean(container.querySelector('.codicon-discard'))).to.equal(false);
        } finally {
            dispose();
        }
    });

    it('falls back to the default variant after deleting the selected one, instead of leaving it unavailable', async () => {
        const { promptService, selections, removals } = setup();
        const { container, dispose } = render(promptService);
        const originalOpen = ConfirmDialog.prototype.open;
        ConfirmDialog.prototype.open = async () => true;
        try {
            const remove = container.querySelector<HTMLButtonElement>('.ai-variant-action-button:last-of-type');
            remove!.click();
            // Let the confirmation and both service calls settle.
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(removals).to.deep.equal(['coder-system-agent-mode-nina']);
            expect(selections).to.deep.equal([['coder', 'coder-system-agent-mode']]);
        } finally {
            ConfirmDialog.prototype.open = originalOpen;
            dispose();
        }
    });
});

describe('AiArrayInput', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    /** Renders the editor with a validator that refuses anything containing `*`, and reports the adds. */
    function mountList(values: string[]): { container: HTMLElement; added: string[][]; dispose: () => void } {
        const added: string[][] = [];
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => root.render(React.createElement(AiArrayInput, {
            values,
            ariaLabel: 'Patterns',
            addPlaceholder: 'Add pattern…',
            validate: (value: string) => value.includes('*') ? `"${value}" is not allowed` : undefined,
            onChange: (next: string[]) => { added.push(next); }
        })));
        return { container, added, dispose: () => { flushSync(() => root.unmount()); container.remove(); } };
    }

    it('adds an accepted entry', () => {
        const { container, added, dispose } = mountList(['git log ']);
        try {
            typeInto(container, 'npm test');
            flushSync(() => container.querySelector<HTMLElement>('.codicon-add')!.click());

            expect(added).to.deep.equal([['git log ', 'npm test']]);
        } finally {
            dispose();
        }
    });

    it('refuses a rejected entry, reporting why and keeping the text for correction', () => {
        const { container, added, dispose } = mountList([]);
        try {
            typeInto(container, 'git log*');
            flushSync(() => container.querySelector<HTMLElement>('.codicon-add')!.click());

            // Nothing written, the reason is shown, and the input still holds what was typed.
            expect(added).to.be.empty;
            expect(container.textContent).to.include('"git log*" is not allowed');
            expect(container.querySelector<HTMLInputElement>('input')!.value).to.equal('git log*');
        } finally {
            dispose();
        }
    });

    it('clears the reported problem once the text changes', () => {
        const { container, dispose } = mountList([]);
        try {
            typeInto(container, '*');
            flushSync(() => container.querySelector<HTMLElement>('.codicon-add')!.click());
            expect(container.textContent).to.include('not allowed');

            typeInto(container, 'npm test');
            expect(container.textContent).to.not.include('not allowed');
        } finally {
            dispose();
        }
    });
});

describe('AiNumberStepper', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    function mountStepper(value: number, integer?: boolean): { container: HTMLElement; committed: number[]; dispose: () => void } {
        const committed: number[] = [];
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => root.render(React.createElement(AiNumberStepper, {
            value,
            ariaLabel: 'Retry delay',
            integer,
            min: 0,
            onCommit: (next: number) => { committed.push(next); }
        })));
        return { container, committed, dispose: () => { flushSync(() => root.unmount()); container.remove(); } };
    }

    /** React listens for `focusout`, not `blur`, so that is what a real focus loss delivers to it. */
    function commitByBlur(container: HTMLElement): void {
        const input = container.querySelector<HTMLInputElement>('input')!;
        const view = container.ownerDocument.defaultView as unknown as { FocusEvent: typeof FocusEvent };
        flushSync(() => input.dispatchEvent(new view.FocusEvent('focusout', { bubbles: true })));
    }

    it('keeps a fractional value for a `number` preference', () => {
        const { container, committed, dispose } = mountStepper(60);
        try {
            typeInto(container, '1.5');
            commitByBlur(container);

            expect(committed).to.deep.equal([1.5]);
            // Also displayed as typed: rounding it away would hide what was just stored.
            expect(container.querySelector<HTMLInputElement>('input')!.value).to.equal('1.5');
        } finally {
            dispose();
        }
    });

    it('rounds a fractional value for an `integer` preference', () => {
        const { container, committed, dispose } = mountStepper(60, true);
        try {
            typeInto(container, '1.5');
            commitByBlur(container);

            expect(committed).to.deep.equal([2]);
        } finally {
            dispose();
        }
    });

    it('keeps the current value when the text is not a number', () => {
        const { container, committed, dispose } = mountStepper(60);
        try {
            typeInto(container, 'soon');
            commitByBlur(container);

            expect(committed).to.be.empty;
            expect(container.querySelector<HTMLInputElement>('input')!.value).to.equal('60');
        } finally {
            dispose();
        }
    });
});
