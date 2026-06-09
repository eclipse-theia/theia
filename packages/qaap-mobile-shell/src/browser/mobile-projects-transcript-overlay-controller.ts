// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { MobileProjectsTranscriptUi } from './mobile-projects-transcript-ui';
import { MobileProjectsTranscriptHistoryUi } from './mobile-projects-transcript-history-ui';
import { MobileProjectsTranscriptComposerUi } from './mobile-projects-transcript-composer-ui';
import { MobileProjectsTranscriptStickyComposerUi } from './mobile-projects-transcript-sticky-composer-ui';
import { MobileProjectsTranscriptSheetUi } from './mobile-projects-transcript-sheet-ui';
import { MobileProjectsTranscriptSurfacesUi } from './mobile-projects-transcript-surfaces-ui';
import { MobileProjectsTranscriptVerifyUi } from './mobile-projects-transcript-verify-ui';
import { MobileProjectsTranscriptHeaderUi } from './mobile-projects-transcript-header-ui';
import { MobileProjectsTranscriptSubmitUi } from './mobile-projects-transcript-submit-ui';
import { MobileProjectsTranscriptLiveUi } from './mobile-projects-transcript-live-ui';
import { MobileProjectsTranscriptMessagesUi } from './mobile-projects-transcript-messages-ui';
import type { MobileProjectsTranscriptOverlayHost } from './mobile-projects-transcript-overlay-host';
import { TranscriptOverlayState } from './mobile-projects-transcript-overlay-state';
import type { WorkHubTranscriptBridge } from './work-hub-transcript-bridge';

/** Owns transcript overlay state and `MobileProjectsTranscript*Ui` modules (Phase 3). */
export class TranscriptOverlayController {

    readonly state = new TranscriptOverlayState();
    readonly transcriptUi = new MobileProjectsTranscriptUi();
    readonly historyUi: MobileProjectsTranscriptHistoryUi;
    readonly composerUi: MobileProjectsTranscriptComposerUi;
    readonly stickyComposerUi: MobileProjectsTranscriptStickyComposerUi;
    readonly sheetUi: MobileProjectsTranscriptSheetUi;
    readonly surfacesUi: MobileProjectsTranscriptSurfacesUi;
    readonly headerUi: MobileProjectsTranscriptHeaderUi;
    readonly submitUi: MobileProjectsTranscriptSubmitUi;
    readonly messagesUi: MobileProjectsTranscriptMessagesUi;
    readonly liveUi: MobileProjectsTranscriptLiveUi;
    readonly verifyUi: MobileProjectsTranscriptVerifyUi;

    constructor(
        overlayHost: MobileProjectsTranscriptOverlayHost,
        workHub: WorkHubTranscriptBridge,
    ) {
        this.historyUi = new MobileProjectsTranscriptHistoryUi(overlayHost);
        this.composerUi = new MobileProjectsTranscriptComposerUi(overlayHost);
        this.stickyComposerUi = new MobileProjectsTranscriptStickyComposerUi(overlayHost, workHub);
        this.headerUi = new MobileProjectsTranscriptHeaderUi(overlayHost, workHub);
        this.messagesUi = new MobileProjectsTranscriptMessagesUi(overlayHost, workHub);
        this.liveUi = new MobileProjectsTranscriptLiveUi(overlayHost);
        this.submitUi = new MobileProjectsTranscriptSubmitUi(overlayHost);
        this.verifyUi = new MobileProjectsTranscriptVerifyUi(overlayHost);
        this.sheetUi = new MobileProjectsTranscriptSheetUi(overlayHost, workHub);
        this.surfacesUi = new MobileProjectsTranscriptSurfacesUi(overlayHost, this.historyUi);
    }
}
