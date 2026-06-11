// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { injectable } from '@theia/core/shared/inversify';
import { patchAbstractStreamParsingChatAgentForIncrementalParse } from '../common/qaap-incremental-stream-parse';

/** Installs O(1) markdown streaming for all {@link AbstractStreamParsingChatAgent} subclasses. */
@injectable()
export class QaapIncrementalStreamParsingContribution implements FrontendApplicationContribution {

    onStart(): void {
        patchAbstractStreamParsingChatAgentForIncrementalParse();
    }
}
