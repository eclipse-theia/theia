// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';

export interface QaapWorkHubDiffDelegate {
    openDiffInWorkHub(projectId?: string): Promise<void>;
}

/** Bridges diff-review open requests (commands, push routes) to the mobile Work Hub panel. */
@injectable()
export class QaapWorkHubDiffService {

    protected delegate: QaapWorkHubDiffDelegate | undefined;

    setDelegate(delegate: QaapWorkHubDiffDelegate | undefined): void {
        this.delegate = delegate;
    }

    async openDiffInWorkHub(projectId?: string): Promise<void> {
        await this.delegate?.openDiffInWorkHub(projectId);
    }
}
