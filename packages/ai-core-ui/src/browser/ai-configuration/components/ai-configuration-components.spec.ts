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
import { AiConfigurationSettingRow } from './ai-configuration-setting-row';
import { ConfirmDialog } from '@theia/core/lib/browser';
import { PromptCustomizationDialogs } from './prompt-customization-dialogs';
import { VariantSetCard } from './variant-set-card';
import { AiSettingsRowService } from './ai-settings-row-service';
import { PromptFragment, PromptService } from '@theia/ai-core/lib/common/prompt-service';

disableJSDOM();

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

    it('AiConfigurationEmptyState renders the message and an optional action', () => {
        const tree = AiConfigurationEmptyState({ message: 'Nothing here', action: React.createElement('button', {}, 'Add') });
        expect(textOf(tree)).to.include('Nothing here').and.to.include('Add');
    });

    it('AiConfigurationItemDetailHeader renders title and subtitle', () => {
        const tree = AiConfigurationItemDetailHeader({ title: 'Coder', subtitle: 'agent-id-1' });
        expect(textOf(tree)).to.include('Coder').and.to.include('agent-id-1');
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
