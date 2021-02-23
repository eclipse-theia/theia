/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { KeybindingContext } from '@theia/core/lib/browser';
import { DebugSessionManager } from './debug-session-manager';
import { DebugEditorService } from './editor/debug-editor-service';
import { DebugEditorModel } from './editor/debug-editor-model';

export namespace DebugKeybindingContexts {

    export const inDebugMode = 'inDebugMode';

    export const breakpointWidgetInputFocus = 'breakpointWidgetInputFocus';

    export const breakpointWidgetInputStrictFocus = 'breakpointWidgetInputStrictFocus';

}

@injectable()
export class InDebugModeContext implements KeybindingContext {

    readonly id: string = DebugKeybindingContexts.inDebugMode;

    @inject(DebugSessionManager)
    protected readonly manager: DebugSessionManager;

    isEnabled(): boolean {
        return this.manager.inDebugMode;
    }

}

@injectable()
export class BreakpointWidgetInputFocusContext implements KeybindingContext {

    readonly id: string = DebugKeybindingContexts.breakpointWidgetInputFocus;

    @inject(DebugEditorService)
    protected readonly editors: DebugEditorService;

    isEnabled(): boolean {
        const model = this.editors.model;
        return !!model && !!model.breakpointWidget.position && this.isFocused(model);
    }

    protected isFocused(model: DebugEditorModel): boolean {
        return !!model.breakpointWidget.input && model.breakpointWidget.input.isFocused({ strict: true });
    }

}

@injectable()
export class BreakpointWidgetInputStrictFocusContext extends BreakpointWidgetInputFocusContext {

    readonly id: string = DebugKeybindingContexts.breakpointWidgetInputStrictFocus;

    protected isFocused(model: DebugEditorModel): boolean {
        return super.isFocused(model) || model.editor.isFocused({ strict: true });
    }

}
