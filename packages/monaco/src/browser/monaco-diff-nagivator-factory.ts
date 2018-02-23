/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
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
                navigator.initIdx(fwd);
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
