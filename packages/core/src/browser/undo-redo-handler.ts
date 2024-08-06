// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import { inject, injectable, named, postConstruct } from 'inversify';
import { ContributionProvider } from '../common';

export const UndoRedoHandler = Symbol('UndoRedoHandler');

export interface UndoRedoHandler<T> {
    priority: number;
    select(): T | undefined;
    undo(item: T): void;
    redo(item: T): void;
}

@injectable()
export class UndoRedoHandlerService {

    @inject(ContributionProvider) @named(UndoRedoHandler)
    protected readonly provider: ContributionProvider<UndoRedoHandler<unknown>>;

    protected handlers: UndoRedoHandler<unknown>[];

    @postConstruct()
    protected init(): void {
        this.handlers = this.provider.getContributions().sort((a, b) => b.priority - a.priority);
    }

    undo(): void {
        for (const handler of this.handlers) {
            const selection = handler.select();
            if (selection) {
                handler.undo(selection);
                return;
            }
        }
    }

    redo(): void {
        for (const handler of this.handlers) {
            const selection = handler.select();
            if (selection) {
                handler.redo(selection);
                return;
            }
        }
    }

}

@injectable()
export class DomInputUndoRedoHandler implements UndoRedoHandler<Element> {

    priority = 1000;

    select(): Element | undefined {
        const element = document.activeElement;
        if (element && ['input', 'textarea'].includes(element.tagName.toLowerCase())) {
            return element;
        }
        return undefined;
    }

    undo(item: Element): void {
        document.execCommand('undo');
    }

    redo(item: Element): void {
        document.execCommand('redo');
    }

}
