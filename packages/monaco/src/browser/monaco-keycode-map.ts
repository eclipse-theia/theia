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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as browser from '@theia/core/lib/browser';
import { KeyCode } from 'monaco-editor-core';
import { OperatingSystem } from 'monaco-editor-core/esm/vs/base/common/platform';

export const KEY_CODE_MAP: KeyCode[] = [];
(function (): void {
    KEY_CODE_MAP[3] = KeyCode.PauseBreak; // VK_CANCEL 0x03 Control-break processing
    KEY_CODE_MAP[8] = KeyCode.Backspace;
    KEY_CODE_MAP[9] = KeyCode.Tab;
    KEY_CODE_MAP[13] = KeyCode.Enter;
    KEY_CODE_MAP[16] = KeyCode.Shift;
    KEY_CODE_MAP[17] = KeyCode.Ctrl;
    KEY_CODE_MAP[18] = KeyCode.Alt;
    KEY_CODE_MAP[19] = KeyCode.PauseBreak;
    KEY_CODE_MAP[20] = KeyCode.CapsLock;
    KEY_CODE_MAP[27] = KeyCode.Escape;
    KEY_CODE_MAP[32] = KeyCode.Space;
    KEY_CODE_MAP[33] = KeyCode.PageUp;
    KEY_CODE_MAP[34] = KeyCode.PageDown;
    KEY_CODE_MAP[35] = KeyCode.End;
    KEY_CODE_MAP[36] = KeyCode.Home;
    KEY_CODE_MAP[37] = KeyCode.LeftArrow;
    KEY_CODE_MAP[38] = KeyCode.UpArrow;
    KEY_CODE_MAP[39] = KeyCode.RightArrow;
    KEY_CODE_MAP[40] = KeyCode.DownArrow;
    KEY_CODE_MAP[45] = KeyCode.Insert;
    KEY_CODE_MAP[46] = KeyCode.Delete;

    KEY_CODE_MAP[48] = KeyCode.KEY_0;
    KEY_CODE_MAP[49] = KeyCode.KEY_1;
    KEY_CODE_MAP[50] = KeyCode.KEY_2;
    KEY_CODE_MAP[51] = KeyCode.KEY_3;
    KEY_CODE_MAP[52] = KeyCode.KEY_4;
    KEY_CODE_MAP[53] = KeyCode.KEY_5;
    KEY_CODE_MAP[54] = KeyCode.KEY_6;
    KEY_CODE_MAP[55] = KeyCode.KEY_7;
    KEY_CODE_MAP[56] = KeyCode.KEY_8;
    KEY_CODE_MAP[57] = KeyCode.KEY_9;

    KEY_CODE_MAP[65] = KeyCode.KEY_A;
    KEY_CODE_MAP[66] = KeyCode.KEY_B;
    KEY_CODE_MAP[67] = KeyCode.KEY_C;
    KEY_CODE_MAP[68] = KeyCode.KEY_D;
    KEY_CODE_MAP[69] = KeyCode.KEY_E;
    KEY_CODE_MAP[70] = KeyCode.KEY_F;
    KEY_CODE_MAP[71] = KeyCode.KEY_G;
    KEY_CODE_MAP[72] = KeyCode.KEY_H;
    KEY_CODE_MAP[73] = KeyCode.KEY_I;
    KEY_CODE_MAP[74] = KeyCode.KEY_J;
    KEY_CODE_MAP[75] = KeyCode.KEY_K;
    KEY_CODE_MAP[76] = KeyCode.KEY_L;
    KEY_CODE_MAP[77] = KeyCode.KEY_M;
    KEY_CODE_MAP[78] = KeyCode.KEY_N;
    KEY_CODE_MAP[79] = KeyCode.KEY_O;
    KEY_CODE_MAP[80] = KeyCode.KEY_P;
    KEY_CODE_MAP[81] = KeyCode.KEY_Q;
    KEY_CODE_MAP[82] = KeyCode.KEY_R;
    KEY_CODE_MAP[83] = KeyCode.KEY_S;
    KEY_CODE_MAP[84] = KeyCode.KEY_T;
    KEY_CODE_MAP[85] = KeyCode.KEY_U;
    KEY_CODE_MAP[86] = KeyCode.KEY_V;
    KEY_CODE_MAP[87] = KeyCode.KEY_W;
    KEY_CODE_MAP[88] = KeyCode.KEY_X;
    KEY_CODE_MAP[89] = KeyCode.KEY_Y;
    KEY_CODE_MAP[90] = KeyCode.KEY_Z;

    KEY_CODE_MAP[93] = KeyCode.ContextMenu;

    KEY_CODE_MAP[96] = KeyCode.NUMPAD_0;
    KEY_CODE_MAP[97] = KeyCode.NUMPAD_1;
    KEY_CODE_MAP[98] = KeyCode.NUMPAD_2;
    KEY_CODE_MAP[99] = KeyCode.NUMPAD_3;
    KEY_CODE_MAP[100] = KeyCode.NUMPAD_4;
    KEY_CODE_MAP[101] = KeyCode.NUMPAD_5;
    KEY_CODE_MAP[102] = KeyCode.NUMPAD_6;
    KEY_CODE_MAP[103] = KeyCode.NUMPAD_7;
    KEY_CODE_MAP[104] = KeyCode.NUMPAD_8;
    KEY_CODE_MAP[105] = KeyCode.NUMPAD_9;
    KEY_CODE_MAP[106] = KeyCode.NUMPAD_MULTIPLY;
    KEY_CODE_MAP[107] = KeyCode.NUMPAD_ADD;
    KEY_CODE_MAP[108] = KeyCode.NUMPAD_SEPARATOR;
    KEY_CODE_MAP[109] = KeyCode.NUMPAD_SUBTRACT;
    KEY_CODE_MAP[110] = KeyCode.NUMPAD_DECIMAL;
    KEY_CODE_MAP[111] = KeyCode.NUMPAD_DIVIDE;

    KEY_CODE_MAP[112] = KeyCode.F1;
    KEY_CODE_MAP[113] = KeyCode.F2;
    KEY_CODE_MAP[114] = KeyCode.F3;
    KEY_CODE_MAP[115] = KeyCode.F4;
    KEY_CODE_MAP[116] = KeyCode.F5;
    KEY_CODE_MAP[117] = KeyCode.F6;
    KEY_CODE_MAP[118] = KeyCode.F7;
    KEY_CODE_MAP[119] = KeyCode.F8;
    KEY_CODE_MAP[120] = KeyCode.F9;
    KEY_CODE_MAP[121] = KeyCode.F10;
    KEY_CODE_MAP[122] = KeyCode.F11;
    KEY_CODE_MAP[123] = KeyCode.F12;
    KEY_CODE_MAP[124] = KeyCode.F13;
    KEY_CODE_MAP[125] = KeyCode.F14;
    KEY_CODE_MAP[126] = KeyCode.F15;
    KEY_CODE_MAP[127] = KeyCode.F16;
    KEY_CODE_MAP[128] = KeyCode.F17;
    KEY_CODE_MAP[129] = KeyCode.F18;
    KEY_CODE_MAP[130] = KeyCode.F19;

    KEY_CODE_MAP[144] = KeyCode.NumLock;
    KEY_CODE_MAP[145] = KeyCode.ScrollLock;

    KEY_CODE_MAP[186] = KeyCode.US_SEMICOLON;
    KEY_CODE_MAP[187] = KeyCode.US_EQUAL;
    KEY_CODE_MAP[188] = KeyCode.US_COMMA;
    KEY_CODE_MAP[189] = KeyCode.US_MINUS;
    KEY_CODE_MAP[190] = KeyCode.US_DOT;
    KEY_CODE_MAP[191] = KeyCode.US_SLASH;
    KEY_CODE_MAP[192] = KeyCode.US_BACKTICK;
    KEY_CODE_MAP[193] = KeyCode.ABNT_C1;
    KEY_CODE_MAP[194] = KeyCode.ABNT_C2;
    KEY_CODE_MAP[219] = KeyCode.US_OPEN_SQUARE_BRACKET;
    KEY_CODE_MAP[220] = KeyCode.US_BACKSLASH;
    KEY_CODE_MAP[221] = KeyCode.US_CLOSE_SQUARE_BRACKET;
    KEY_CODE_MAP[222] = KeyCode.US_QUOTE;
    KEY_CODE_MAP[223] = KeyCode.OEM_8;

    KEY_CODE_MAP[226] = KeyCode.OEM_102;

    /**
     * https://lists.w3.org/Archives/Public/www-dom/2010JulSep/att-0182/keyCode-spec.html
     * If an Input Method Editor is processing key input and the event is keydown, return 229.
     */
    KEY_CODE_MAP[229] = KeyCode.KEY_IN_COMPOSITION;

    if (browser.isIE) {
        KEY_CODE_MAP[91] = KeyCode.Meta;
    } else if (browser.isFirefox) {
        KEY_CODE_MAP[59] = KeyCode.US_SEMICOLON;
        KEY_CODE_MAP[107] = KeyCode.US_EQUAL;
        KEY_CODE_MAP[109] = KeyCode.US_MINUS;
        if (monaco.platform.OS === OperatingSystem.Macintosh) {
            KEY_CODE_MAP[224] = KeyCode.Meta;
        }
    } else if (browser.isWebKit) {
        KEY_CODE_MAP[91] = KeyCode.Meta;
        if (monaco.platform.OS === OperatingSystem.Macintosh) {
            // the two meta keys in the Mac have different key codes (91 and 93)
            KEY_CODE_MAP[93] = KeyCode.Meta;
        } else {
            KEY_CODE_MAP[92] = KeyCode.Meta;
        }
    }
})();
