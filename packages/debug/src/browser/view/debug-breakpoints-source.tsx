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

import { injectable, inject, postConstruct } from 'inversify';
import { TreeSource, TreeElement } from '@theia/core/lib/browser/source-tree';
import { DebugViewModel } from './debug-view-model';
import { BreakpointManager } from '../breakpoint/breakpoint-manager';
import { DebugExceptionBreakpoint } from './debug-exception-breakpoint';

@injectable()
export class DebugBreakpointsSource extends TreeSource {

    @inject(DebugViewModel)
    protected readonly model: DebugViewModel;

    @inject(BreakpointManager)
    protected readonly breakpoints: BreakpointManager;

    constructor() {
        super({
            placeholder: 'No breakpoints'
        });
    }

    @postConstruct()
    protected init(): void {
        this.fireDidChange();
        this.toDispose.push(this.model.onDidChangeBreakpoints(() => this.fireDidChange()));
    }

    *getElements(): IterableIterator<TreeElement> {
        for (const exceptionBreakpoint of this.breakpoints.getExceptionBreakpoints()) {
            yield new DebugExceptionBreakpoint(exceptionBreakpoint, this.breakpoints);
        }
        for (const functionBreakpoint of this.model.functionBreakpoints) {
            yield functionBreakpoint;
        }
        for (const breakpoint of this.model.breakpoints) {
            yield breakpoint;
        }
    }

}
