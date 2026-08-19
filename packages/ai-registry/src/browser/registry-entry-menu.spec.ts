// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { expect } from 'chai';
import { ContextMenuRenderer, RenderContextMenuOptions } from '@theia/core/lib/browser';
import { AI_REGISTRY_ENTRY_CONTEXT_MENU, RegistryEntryContext } from './registry-entry-context';
import { RegistryEntryMenuEvent, showEntryMenu } from './registry-entry-menu';

const entry: RegistryEntryContext = {
    artifactKind: 'skill',
    copyableId: 'io.github.example/example-skill',
    autoUpdateId: 'io.github.example/example-skill'
};

/** Stands in for the gear element, which is the only thing the anchor needs from the DOM. */
const gear = {
    getBoundingClientRect: () => ({ left: 40, bottom: 90 })
} as unknown as HTMLElement;

function pointerEvent(clientX: number, clientY: number): RegistryEntryMenuEvent {
    return { preventDefault: () => { }, stopPropagation: () => { }, clientX, clientY, currentTarget: gear } as unknown as RegistryEntryMenuEvent;
}

function keyboardEvent(): RegistryEntryMenuEvent {
    return { preventDefault: () => { }, stopPropagation: () => { }, key: 'Enter', currentTarget: gear } as unknown as RegistryEntryMenuEvent;
}

describe('showEntryMenu', () => {

    let rendered: RenderContextMenuOptions | undefined;
    let contextMenuRenderer: ContextMenuRenderer;

    beforeEach(() => {
        rendered = undefined;
        contextMenuRenderer = {
            render: (options: RenderContextMenuOptions) => { rendered = options; }
        } as unknown as ContextMenuRenderer;
    });

    it('passes the entry to the shared menu as its argument', () => {
        showEntryMenu(pointerEvent(12, 34), entry, contextMenuRenderer);
        expect(rendered!.menuPath).to.deep.equal(AI_REGISTRY_ENTRY_CONTEXT_MENU);
        expect(rendered!.args).to.deep.equal([entry]);
    });

    it('anchors the menu at the pointer for a mouse interaction', () => {
        showEntryMenu(pointerEvent(12, 34), entry, contextMenuRenderer);
        expect(rendered!.anchor).to.deep.equal({ x: 12, y: 34 });
    });

    it('anchors the menu below the activated element for a keyboard interaction, which has no pointer position', () => {
        showEntryMenu(keyboardEvent(), entry, contextMenuRenderer);
        expect(rendered!.anchor).to.deep.equal({ x: 40, y: 90 });
    });
});
