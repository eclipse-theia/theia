// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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

import type { ChangeSetDecoration, ChangeSetElement } from '@theia/ai-chat';
import type { ChangeSetDecorator } from '@theia/ai-chat/lib/browser/change-set-decorator-service';
import { Emitter } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import type { ScanOSSResult } from '@theia/scanoss';

@injectable()
export class ChangeSetScanDecorator implements ChangeSetDecorator {
    readonly id = 'thei-change-set-scanoss-decorator';

    protected readonly emitter = new Emitter<void>();
    readonly onDidChangeDecorations = this.emitter.event;

    protected scanResult: ScanOSSResult[] = [];

    setScanResult(results: ScanOSSResult[]): void {
        this.scanResult = results;
        this.emitter.fire();
    }

    decorate(element: ChangeSetElement): ChangeSetDecoration | undefined {
        const match = this.scanResult.find(result => {
            if (result.type === 'match') {
                return result.file === element.uri.path.toString();
            }
            return false;
        });

        if (match) {
            return {
                additionalInfoSuffixIcon: ['additional-info-scanoss-icon', 'match', 'codicon', 'codicon-warning'],
            };
        }

        return undefined;
    }

}
