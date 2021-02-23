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

import { LabelProvider } from '@theia/core/lib/browser';
import { EditorManager, EditorOpenerOptions, EditorWidget } from '@theia/editor/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';
import { DebugSession } from '../debug-session';
import { URI as Uri } from '@theia/core/shared/vscode-uri';

export class DebugSourceData {
    readonly raw: DebugProtocol.Source;
}

export class DebugSource extends DebugSourceData {

    constructor(
        protected readonly session: DebugSession,
        protected readonly editorManager: EditorManager,
        protected readonly labelProvider: LabelProvider
    ) {
        super();
    }

    get uri(): URI {
        return DebugSource.toUri(this.raw);
    }

    update(data: Partial<DebugSourceData>): void {
        Object.assign(this, data);
    }

    open(options?: EditorOpenerOptions): Promise<EditorWidget> {
        return this.editorManager.open(this.uri, options);
    }

    async load(): Promise<string> {
        const source = this.raw;
        const sourceReference = source.sourceReference!;
        const response = await this.session.sendRequest('source', {
            sourceReference,
            source
        });
        return response.body.content;
    }

    get inMemory(): boolean {
        return this.uri.scheme === DebugSource.SCHEME;
    }

    get name(): string {
        if (this.inMemory) {
            return this.raw.name || this.uri.path.base || this.uri.path.toString();
        }
        return this.labelProvider.getName(this.uri);
    }

    get longName(): string {
        if (this.inMemory) {
            return this.name;
        }
        return this.labelProvider.getLongName(this.uri);
    }

    static SCHEME = 'debug';
    static SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9\+\-\.]+:/;
    static toUri(raw: DebugProtocol.Source): URI {
        if (raw.sourceReference && raw.sourceReference > 0) {
            return new URI().withScheme(DebugSource.SCHEME).withPath(raw.name!).withQuery(String(raw.sourceReference));
        }
        if (!raw.path) {
            throw new Error('Unrecognized source type: ' + JSON.stringify(raw));
        }
        if (raw.path.match(DebugSource.SCHEME_PATTERN)) {
            return new URI(raw.path);
        }
        return new URI(Uri.file(raw.path));
    }
}
