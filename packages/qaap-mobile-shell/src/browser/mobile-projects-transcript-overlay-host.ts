// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * Unified host contract for the transcript overlay cluster.
 *
 * `MobileProjectsPanel` implements this intersection via a single runtime cast
 * (`transcriptOverlayHost`). Each `MobileProjectsTranscript*Ui` module keeps its
 * narrower per-module `*Host` interface; the overlay host is the typed union of
 * all of them for extraction planning (Phase 1) without behaviour changes.
 */

export type { MobileProjectsTranscriptComposerHost } from './mobile-projects-transcript-composer-ui';
export type { MobileProjectsTranscriptHeaderHost } from './mobile-projects-transcript-header-ui';
export type { MobileProjectsTranscriptHistoryHost } from './mobile-projects-transcript-history-ui';
export type { MobileProjectsTranscriptLiveHost } from './mobile-projects-transcript-live-ui';
export type { MobileProjectsTranscriptMessagesHost } from './mobile-projects-transcript-messages-ui';
export type { MobileProjectsTranscriptSheetHost } from './mobile-projects-transcript-sheet-ui';
export type { MobileProjectsTranscriptStickyComposerHost } from './mobile-projects-transcript-sticky-composer-ui';
export type { MobileProjectsTranscriptSubmitHost } from './mobile-projects-transcript-submit-ui';
export type { MobileProjectsTranscriptSurfacesHost } from './mobile-projects-transcript-surfaces-ui';
export type { MobileProjectsTranscriptVerifyHost } from './mobile-projects-transcript-verify-ui';
export { TranscriptOverlayController } from './mobile-projects-transcript-overlay-controller';
export {
    TranscriptOverlayState,
    TRANSCRIPT_OVERLAY_STATE_KEYS,
    bindTranscriptOverlayStateAccessors,
} from '@theia/qaap-transcript-overlay/lib/browser/mobile-projects-transcript-overlay-state';
export type { WorkHubTranscriptBridge } from '@theia/qaap-transcript-overlay/lib/browser/work-hub-transcript-bridge';

import type { MobileProjectsTranscriptComposerHost } from './mobile-projects-transcript-composer-ui';
import type { MobileProjectsTranscriptHeaderHost } from './mobile-projects-transcript-header-ui';
import type { MobileProjectsTranscriptHistoryHost } from './mobile-projects-transcript-history-ui';
import type { MobileProjectsTranscriptLiveHost } from './mobile-projects-transcript-live-ui';
import type { MobileProjectsTranscriptMessagesHost } from './mobile-projects-transcript-messages-ui';
import type { MobileProjectsTranscriptSheetHost } from './mobile-projects-transcript-sheet-ui';
import type { MobileProjectsTranscriptStickyComposerHost } from './mobile-projects-transcript-sticky-composer-ui';
import type { MobileProjectsTranscriptSubmitHost } from './mobile-projects-transcript-submit-ui';
import type { MobileProjectsTranscriptSurfacesHost } from './mobile-projects-transcript-surfaces-ui';
import type { MobileProjectsTranscriptVerifyHost } from './mobile-projects-transcript-verify-ui';

/** Full panel surface required by all transcript overlay `*Ui` modules. */
export type MobileProjectsTranscriptOverlayHost =
    MobileProjectsTranscriptComposerHost &
    MobileProjectsTranscriptHeaderHost &
    MobileProjectsTranscriptHistoryHost &
    MobileProjectsTranscriptLiveHost &
    MobileProjectsTranscriptMessagesHost &
    MobileProjectsTranscriptSheetHost &
    MobileProjectsTranscriptStickyComposerHost &
    MobileProjectsTranscriptSubmitHost &
    MobileProjectsTranscriptSurfacesHost &
    MobileProjectsTranscriptVerifyHost;
