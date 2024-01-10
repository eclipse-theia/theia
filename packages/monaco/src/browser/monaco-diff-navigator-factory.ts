// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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
import { DiffNavigator } from '@theia/editor/lib/browser';
import * as monaco from '@theia/monaco-editor-core';
import { DiffNavigator as MonacoDiffNavigator } from '@theia/monaco-editor-core/esm/vs/editor/browser/widget/diffNavigator';
import { IStandaloneDiffEditor } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneCodeEditor';

@injectable()
export class MonacoDiffNavigatorFactory {

    static nullNavigator = <DiffNavigator>{
        canNavigate: () => false,
        hasNext: () => false,
        hasPrevious: () => false,
        next: () => { },
        previous: () => { },
    };

    createdDiffNavigator(editor: IStandaloneDiffEditor | monaco.editor.IStandaloneDiffEditor, options?: monaco.editor.IDiffNavigatorOptions): DiffNavigator {
        const navigator = new MonacoDiffNavigator(editor as IStandaloneDiffEditor, options);
        const ensureInitialized = (fwd: boolean) => {
            if (navigator['nextIdx'] < 0) {
                navigator['_initIdx'](fwd);
            }
        };
        return {
            canNavigate: () => navigator.canNavigate(),
            hasNext: () => {
                if (navigator.canNavigate()) {
                    ensureInitialized(true);
                    return navigator['nextIdx'] + 1 < navigator['ranges'].length;
                }
                return false;
            },
            hasPrevious: () => {
                if (navigator.canNavigate()) {
                    ensureInitialized(false);
                    return navigator['nextIdx'] > 0;
                }
                return false;
            },
            next: () => navigator.next(),
            previous: () => navigator.previous(),
        };
    }
}
