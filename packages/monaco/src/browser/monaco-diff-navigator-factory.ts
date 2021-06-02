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

import { injectable } from '@theia/core/shared/inversify';
import { DiffNavigator } from '@theia/editor/lib/browser';

import IStandaloneDiffEditor = monaco.editor.IStandaloneDiffEditor;
import IDiffNavigatorOptions = monaco.editor.IDiffNavigatorOptions;

@injectable()
export class MonacoDiffNavigatorFactory {

    static nullNavigator = <DiffNavigator>{
        canNavigate: () => false,
        hasNext: () => false,
        hasPrevious: () => false,
        next: () => { },
        previous: () => { },
        revealFirst: false,
    };

    createdDiffNavigator(editor: IStandaloneDiffEditor, options?: IDiffNavigatorOptions): DiffNavigator {
        const navigator = monaco.editor.createDiffNavigator(editor, options);
        const ensureInitialized = (fwd: boolean) => {
            if (navigator.nextIdx < -1) {
                navigator._initIdx(fwd);
            }
        };
        return <DiffNavigator>{
            canNavigate: () => navigator.canNavigate(),
            hasNext: () => {
                ensureInitialized(true);
                return navigator.nextIdx + 1 < navigator.ranges.length;
            },
            hasPrevious: () => {
                ensureInitialized(false);
                return navigator.nextIdx > 0;
            },
            next: () => navigator.next(),
            previous: () => navigator.previous(),
            revealFirst: navigator.revealFirst,
        };
    }
}
