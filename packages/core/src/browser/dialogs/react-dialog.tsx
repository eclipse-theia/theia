// *****************************************************************************
// Copyright (C) 2019 Ericsson and others.
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

import * as React from 'react';
import { injectable, inject } from 'inversify';
import { Disposable } from '../../common';
import { Message } from '../widgets';
import { AbstractDialog, DialogProps } from '../dialogs';
import { createRoot, Root } from 'react-dom/client';

@injectable()
export abstract class ReactDialog<T> extends AbstractDialog<T> {
    protected contentNodeRoot: Root;
    protected isMounted: boolean;

    constructor(
        @inject(DialogProps) props: DialogProps
    ) {
        super(props);
        this.contentNodeRoot = createRoot(this.contentNode);
        this.isMounted = true;
        this.toDispose.push(Disposable.create(() => {
            this.contentNodeRoot.unmount();
            this.isMounted = false;
        }));
    }

    protected override onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        if (!this.isMounted) {
            this.contentNodeRoot = createRoot(this.contentNode);
        }
        this.contentNodeRoot?.render(<>{this.render()}</>);
    }

    /**
     * Render the React widget in the DOM.
     * - If the widget has been previously rendered,
     * any subsequent calls will perform an update and only
     * change the DOM if absolutely necessary.
     */
    protected abstract render(): React.ReactNode;
}
