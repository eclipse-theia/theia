/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

// tslint:disable:no-any

import { MenuPath } from '../common/menu';

export type Anchor = MouseEvent | { x: number, y: number };

export function toAnchor(anchor: HTMLElement | { x: number, y: number }): Anchor {
    return anchor instanceof HTMLElement ? { x: anchor.offsetLeft, y: anchor.offsetTop } : anchor;
}

export const ContextMenuRenderer = Symbol('ContextMenuRenderer');
export interface ContextMenuRenderer {
    render(options: RenderContextMenuOptions): void;
    /** @deprecated since 0.7.2 pass `RenderContextMenuOptions` instead */
    render(menuPath: MenuPath, anchor: Anchor, onHide?: () => void): void;
}

export interface RenderContextMenuOptions {
    menuPath: MenuPath
    anchor: Anchor
    args?: any[]
    onHide?: () => void
}
export namespace RenderContextMenuOptions {
    export function resolve(arg: MenuPath | RenderContextMenuOptions, anchor?: Anchor, onHide?: () => void): RenderContextMenuOptions {
        let menuPath: MenuPath;
        let args: any[];
        if (Array.isArray(arg)) {
            menuPath = arg;
            args = [anchor!];
        } else {
            menuPath = arg.menuPath;
            anchor = arg.anchor;
            onHide = arg.onHide;
            args = arg.args ? [...arg.args, anchor] : [anchor];
        }
        return {
            menuPath,
            anchor: anchor!,
            onHide,
            args
        };
    }
}
