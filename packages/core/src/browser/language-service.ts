// *****************************************************************************
// Copyright (C) 2020 TypeFox and others.
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

import { injectable } from 'inversify';
import { Disposable, Emitter, Event } from '../common';

export interface Language {
    readonly id: string;
    readonly name: string;
    readonly extensions: Set<string>;
    readonly filenames: Set<string>;
    readonly iconClass?: string;
}

@injectable()
export class LanguageService {
    protected readonly onDidChangeIconEmitter = new Emitter<DidChangeIconEvent>();

    /**
     * It should be implemented by an extension, e.g. by the monaco extension.
     */
    get languages(): Language[] {
        return [];
    }

    /**
     * It should be implemented by an extension, e.g. by the monaco extension.
     */
    getLanguage(languageId: string): Language | undefined {
        return undefined;
    }

    /**
     * It should be implemented by an extension, e.g. by the monaco extension.
     */
    detectLanguage(obj: unknown): Language | undefined {
        return undefined;
    }

    /**
     * It should be implemented by an extension, e.g. by the monaco extension.
     */
    registerIcon(languageId: string, iconClass: string): Disposable {
        return Disposable.NULL;
    }

    /**
     * It should be implemented by an extension, e.g. by the monaco extension.
     */
    getIcon(obj: unknown): string | undefined {
        return undefined;
    }

    /**
     * Emit when the icon of a particular language was changed.
     */
    get onDidChangeIcon(): Event<DidChangeIconEvent> {
        return this.onDidChangeIconEmitter.event;
    }
}

export interface DidChangeIconEvent {
    languageId: string;
}
