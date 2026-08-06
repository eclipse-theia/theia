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

    it('AiConfigurationSection renders its title and children', () => {
        const tree = AiConfigurationSection({ title: 'General', children: React.createElement('span', {}, 'row') });
        expect(classNames(tree)).to.include('ai-configuration-section');
        expect(textOf(tree)).to.include('General').and.to.include('row');
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
