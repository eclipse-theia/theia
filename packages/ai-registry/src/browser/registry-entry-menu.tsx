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

import * as React from '@theia/core/shared/react';
import { nls } from '@theia/core';
import { Anchor, ContextMenuRenderer } from '@theia/core/lib/browser';
import { buttonKeyboardProps, isActivationKey } from '@theia/core/lib/browser/keyboard/keyboard-utils';
import { AI_REGISTRY_ENTRY_CONTEXT_MENU, RegistryEntryContext } from './registry-entry-context';

/** The pointer or keyboard interaction that opens the entry context menu. */
export type RegistryEntryMenuEvent = React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>;

/**
 * Opens the shared entry context menu, passing the entry along as the menu argument so the
 * commands can read its artifact kind and registry id.
 */
export function showEntryMenu(
    event: RegistryEntryMenuEvent,
    entry: RegistryEntryContext,
    contextMenuRenderer: ContextMenuRenderer
): void {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    contextMenuRenderer.render({
        menuPath: AI_REGISTRY_ENTRY_CONTEXT_MENU,
        anchor: menuAnchor(event, target),
        args: [entry],
        context: target
    });
}

/**
 * Keyboard activation has no pointer position - `clientX`/`clientY` would both be 0 - so the
 * menu opens below the activated element instead, as core's tab bar toolbar does.
 */
function menuAnchor(event: RegistryEntryMenuEvent, target: HTMLElement): Anchor {
    if ('clientX' in event) {
        return { x: event.clientX, y: event.clientY };
    }
    const { left, bottom } = target.getBoundingClientRect();
    return { x: left, y: bottom };
}

/** The gear that opens {@link showEntryMenu}. */
export const RegistryEntryGear: React.FC<{ className: string; onManage: (event: RegistryEntryMenuEvent) => void }> = props => {
    const label = nls.localizeByDefault('Manage');
    return (
        <div
            className={`codicon codicon-settings-gear action ${props.className}`}
            {...buttonKeyboardProps(label)}
            title={label}
            onClick={props.onManage}
            onKeyDown={event => {
                if (isActivationKey(event)) {
                    props.onManage(event);
                }
            }}
        />
    );
};
