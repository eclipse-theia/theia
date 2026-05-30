// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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
// PluginViewRegistry transitively imports browser widgets (Lumino) that touch `document` at load time.
const disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
// Some transitively imported modules read the frontend config at load time.
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { Disposable } from '@theia/core/lib/common';
import { PluginViewRegistry, ViewContainerInfo } from './plugin-view-registry';

disableJSDOM();

interface RegisteredMenuAction {
    commandId: string;
    label: string;
    when?: string;
}

/**
 * Minimal stand-in for {@link MenuModelRegistry} that records the menu actions registered for the
 * "Views" menu and removes them again when the returned disposable is disposed. This lets us assert
 * on the labels {@link PluginViewRegistry} ends up showing without wiring the full DI container.
 */
class RecordingMenuModelRegistry {
    readonly actions = new Map<string, RegisteredMenuAction>();

    registerMenuAction(_menuPath: unknown, action: RegisteredMenuAction): Disposable {
        this.actions.set(action.commandId, { ...action });
        return Disposable.create(() => this.actions.delete(action.commandId));
    }
}

describe('PluginViewRegistry - view menu labels', () => {

    let registry: PluginViewRegistry;
    let menus: RecordingMenuModelRegistry;

    const toggleCommandId = (id: string): string => `plugin.view-container.${id}.toggle`;
    const internals = (): {
        viewContainers: Map<string, ViewContainerInfo>;
        registerViewMenuAction(containerId: string, label: string): Disposable;
    } => registry as unknown as {
        viewContainers: Map<string, ViewContainerInfo>;
        registerViewMenuAction(containerId: string, label: string): Disposable;
    };

    function registerContainer(id: string, label: string, location: string): Disposable {
        internals().viewContainers.set(id, { id, location, options: { label }, onViewAdded: () => { } });
        return internals().registerViewMenuAction(id, label);
    }

    beforeEach(() => {
        registry = new PluginViewRegistry();
        menus = new RecordingMenuModelRegistry();
        (registry as unknown as { menus: unknown }).menus = menus;
    });

    it('uses the plain label for a single container', () => {
        registerContainer('a', 'Claude Code', 'left');
        expect(menus.actions.get(toggleCommandId('a'))?.label).to.equal('Claude Code');
    });

    it('leaves distinct labels unsuffixed', () => {
        registerContainer('a', 'Explorer', 'left');
        registerContainer('b', 'Claude Code', 'right');
        expect(menus.actions.get(toggleCommandId('a'))?.label).to.equal('Explorer');
        expect(menus.actions.get(toggleCommandId('b'))?.label).to.equal('Claude Code');
    });

    it('suffixes the location when two containers share a label', () => {
        registerContainer('a', 'Claude Code', 'left');
        registerContainer('b', 'Claude Code', 'right');
        expect(menus.actions.get(toggleCommandId('a'))?.label).to.equal('Claude Code (Side Bar)');
        expect(menus.actions.get(toggleCommandId('b'))?.label).to.equal('Claude Code (Secondary Side Bar)');
    });

    it('drops the suffix from the remaining container once the duplicate is removed', () => {
        registerContainer('a', 'Claude Code', 'left');
        const disposeB = registerContainer('b', 'Claude Code', 'right');

        disposeB.dispose();

        expect(menus.actions.get(toggleCommandId('a'))?.label).to.equal('Claude Code');
        expect(menus.actions.has(toggleCommandId('b'))).to.equal(false);
    });

});
