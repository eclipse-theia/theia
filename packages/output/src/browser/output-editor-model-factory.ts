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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { Resource } from '@theia/core/lib/common/resource';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { OutputUri } from '../common/output-uri';
import { MonacoEditorModelFactory } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { MonacoToProtocolConverter } from '@theia/monaco/lib/browser/monaco-to-protocol-converter';
import { ProtocolToMonacoConverter } from '@theia/monaco/lib/browser/protocol-to-monaco-converter';

@injectable()
export class OutputEditorModelFactory implements MonacoEditorModelFactory {

    @inject(MonacoToProtocolConverter)
    protected readonly m2p: MonacoToProtocolConverter;

    @inject(ProtocolToMonacoConverter)
    protected readonly p2m: ProtocolToMonacoConverter;

    readonly scheme: string = OutputUri.SCHEME;

    createModel(
        resource: Resource
    ): MonacoEditorModel {
        return new OutputEditorModel(resource, this.m2p, this.p2m);
    }

}

export class OutputEditorModel extends MonacoEditorModel {

    override get readOnly(): boolean {
        return true;
    }

    protected override setDirty(dirty: boolean): void {
        // NOOP
    }

}
