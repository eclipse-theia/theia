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

import { inject, injectable, optional } from 'inversify';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Disposable, DisposableCollection } from '../../common';

export type RendererHost = HTMLElement;
export const RendererHost = Symbol('RendererHost');

@injectable()
export class ReactRenderer implements Disposable {
    protected readonly toDispose = new DisposableCollection();
    readonly host: HTMLElement;
    protected hostRoot: Root;

    constructor(
        @inject(RendererHost) @optional() host?: RendererHost
    ) {
        this.host = host || document.createElement('div');
        this.hostRoot = createRoot(this.host);
        this.toDispose.push(Disposable.create(() => this.hostRoot.unmount()));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    render(): void {
        // Ignore all render calls after the host element has unmounted
        if (!this.toDispose.disposed) {
            this.hostRoot.render(<React.Fragment>{this.doRender()}</React.Fragment>);
        }
    }

    protected doRender(): React.ReactNode {
        return undefined;
    }
}
