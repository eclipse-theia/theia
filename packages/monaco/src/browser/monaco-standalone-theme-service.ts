/* eslint-disable @typescript-eslint/no-explicit-any */
// *****************************************************************************
// Copyright (C) 2024 STMicroelectronics and others.
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

import { IDisposable } from '@theia/monaco-editor-core/esm/vs/base/common/lifecycle';
import { StandaloneThemeService } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneThemeService';

export class MonacoStandaloneThemeService extends StandaloneThemeService {
    protected get styleElements(): HTMLStyleElement[] {
        // access private style element array
        return (this as any)._styleElements;
    }

    protected get allCSS(): string {
        return (this as any)._allCSS;
    }

    override registerEditorContainer(domNode: HTMLElement): IDisposable {
        const style = domNode.ownerDocument.createElement('style');
        style.type = 'text/css';
        style.media = 'screen';
        style.className = 'monaco-colors';
        style.textContent = this.allCSS;
        domNode.ownerDocument.head.appendChild(style);
        this.styleElements.push(style);
        return {
            dispose: () => {
                for (let i = 0; i < this.styleElements.length; i++) {
                    if (this.styleElements[i] === style) {
                        this.styleElements.splice(i, 1);
                        style.remove();
                        return;
                    }
                }
            }
        };
    }
}
