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

import { injectable } from 'inversify';
import { WidgetOpenHandler, WidgetOpenerOptions } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { HgCommitDetailWidgetOptions, HgCommitDetailWidget } from './hg-commit-detail-widget';
import { HgScmProvider } from '../hg-scm-provider';

export namespace HgCommitDetailUri {
    export const scheme = HgScmProvider.HG_COMMIT_DETAIL;
    export function toCommitSha(uri: URI): string {
        if (uri.scheme === scheme) {
            return uri.fragment;
        }
        throw new Error('The given uri is not an commit detail URI, uri: ' + uri);
    }
}

export type HgCommitDetailOpenerOptions = WidgetOpenerOptions & HgCommitDetailWidgetOptions;

@injectable()
export class HgCommitDetailOpenHandler extends WidgetOpenHandler<HgCommitDetailWidget> {
    readonly id = HgScmProvider.HG_COMMIT_DETAIL;

    canHandle(uri: URI): number {
        try {
            HgCommitDetailUri.toCommitSha(uri);
            return 200;
        } catch {
            return 0;
        }
    }

    protected async doOpen(widget: HgCommitDetailWidget, options: HgCommitDetailOpenerOptions): Promise<void> {
        widget.setContent({
            range: {
                fromRevision: options.sha + '~1',
                toRevision: options.sha
            }
        });
        await super.doOpen(widget, options);
    }

    protected createWidgetOptions(uri: URI, commit: HgCommitDetailOpenerOptions): HgCommitDetailWidgetOptions {
        return commit;
    }

}
