// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { injectable } from '@theia/core/shared/inversify';
import type { AIChatInputWidget } from './chat-input-widget';

/**
 * Tracks the currently focused AIChatInputWidget instance.
 *
 * This is required to support keybindings (e.g. mode cycling) for widgets that are
 * not registered in the application shell, such as the inline Ask AI zone widget.
 * Shell-based lookup via ApplicationShell.findWidgetForElement cannot find those widgets.
 */
@injectable()
export class ChatInputFocusService {
    protected focused: AIChatInputWidget | undefined;

    setFocused(widget: AIChatInputWidget): void {
        this.focused = widget;
    }

    clearFocused(widget: AIChatInputWidget): void {
        if (this.focused === widget) {
            this.focused = undefined;
        }
    }

    getFocused(): AIChatInputWidget | undefined {
        return this.focused;
    }
}
