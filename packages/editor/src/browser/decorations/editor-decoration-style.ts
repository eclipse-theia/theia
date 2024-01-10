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

import { Disposable } from '@theia/core';
import { DecorationStyle } from '@theia/core/lib/browser';

export class EditorDecorationStyle implements Disposable {

    constructor(
        readonly selector: string,
        styleProvider: (style: CSSStyleDeclaration) => void,
        protected decorationsStyleSheet: CSSStyleSheet
    ) {
        const styleRule = DecorationStyle.getOrCreateStyleRule(selector, decorationsStyleSheet);
        if (styleRule) {
            styleProvider(styleRule.style);
        }
    }

    get className(): string {
        return this.selector.split('::')[0];
    }

    dispose(): void {
        DecorationStyle.deleteStyleRule(this.selector, this.decorationsStyleSheet);
    }

}
