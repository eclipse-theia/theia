// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { KeybindingRegistry, ScopedKeybinding } from '@theia/core/lib/browser/keybinding';
import { nls } from '@theia/core/lib/common/nls';

export function keybindingTooltip(keybindingRegistry: KeybindingRegistry, keybinding: ScopedKeybinding): string {
    const resolved = keybindingRegistry.resolveKeybinding(keybinding);
    const inactiveReason = keybindingRegistry.getKeybindingInactiveReason(keybinding);
    if (inactiveReason) {
        return `${nls.localize('theia/keymaps/physicalRealizationUnavailable', 'Physical realization unavailable')}\n${inactiveReason}`;
    }
    const physical = resolved.map(code => keybindingRegistry.physicalComponentsForKeyCode(code, true).join('+')).join(' ');
    const shadowing = keybindingRegistry.getInterpretationShadowing(keybinding);
    if (shadowing.length > 0) {
        return `${physical}\n${nls.localize('theia/keymaps/interpretationShadowing', 'A command-modifier interpretation takes precedence over this keybinding.')}`;
    }
    return physical;
}
