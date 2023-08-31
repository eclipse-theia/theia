// *****************************************************************************
// Copyright (C) 2021 SAP SE or an SAP affiliate company and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// copied and modified from https://github.com/microsoft/vscode/blob/53eac52308c4611000a171cc7bf1214293473c78/src/vs/platform/undoRedo/common/undoRedoService.ts#

import { injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class UndoRedoService {
    private readonly editStacks = new Map<string, ResourceEditStack>();

    pushElement(resource: URI, undo: () => Promise<void>, redo: () => Promise<void>): void {
        let editStack: ResourceEditStack;
        if (this.editStacks.has(resource.toString())) {
            editStack = this.editStacks.get(resource.toString())!;
        } else {
            editStack = new ResourceEditStack();
            this.editStacks.set(resource.toString(), editStack);
        }

        editStack.pushElement({ undo, redo });
    }

    removeElements(resource: URI): void {
        if (this.editStacks.has(resource.toString())) {
            this.editStacks.delete(resource.toString());
        }
    }

    undo(resource: URI): void {
        if (!this.editStacks.has(resource.toString())) {
            return;
        }

        const editStack = this.editStacks.get(resource.toString())!;
        const element = editStack.getClosestPastElement();
        if (!element) {
            return;
        }

        editStack.moveBackward(element);
        element.undo();
    }

    redo(resource: URI): void {
        if (!this.editStacks.has(resource.toString())) {
            return;
        }

        const editStack = this.editStacks.get(resource.toString())!;
        const element = editStack.getClosestFutureElement();
        if (!element) {
            return;
        }

        editStack.moveForward(element);
        element.redo();
    }
}

interface StackElement {
    undo(): Promise<void> | void;
    redo(): Promise<void> | void;
}

export class ResourceEditStack {
    private past: StackElement[];
    private future: StackElement[];

    constructor() {
        this.past = [];
        this.future = [];
    }

    pushElement(element: StackElement): void {
        this.future = [];
        this.past.push(element);
    }

    getClosestPastElement(): StackElement | undefined {
        if (this.past.length === 0) {
            return undefined;
        }
        return this.past[this.past.length - 1];
    }

    getClosestFutureElement(): StackElement | undefined {
        if (this.future.length === 0) {
            return undefined;
        }
        return this.future[this.future.length - 1];
    }

    moveBackward(element: StackElement): void {
        this.past.pop();
        this.future.push(element);
    }

    moveForward(element: StackElement): void {
        this.future.pop();
        this.past.push(element);
    }
}
