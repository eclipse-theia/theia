/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { TextEditor } from './editor';

export interface DiffNavigator {
    revealFirst: boolean;
    canNavigate(): boolean;
    hasNext(): boolean;
    hasPrevious(): boolean;
    next(): void;
    previous(): void;
}

export const DiffNavigatorProvider = Symbol('DiffNavigatorProvider');
export type DiffNavigatorProvider = (editor: TextEditor) => DiffNavigator;
