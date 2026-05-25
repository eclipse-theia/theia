// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { SelectComponent } from '@theia/core/lib/browser/widgets/select-component';

@injectable()
export class QaapSelectComponentOverlayContribution implements FrontendApplicationContribution {
    onStart(_app: FrontendApplication): void {
        SelectComponent.overlayClipBottomProvider = fallbackBottom => {
            const overlay = document.querySelector<HTMLElement>('.theia-mobile-bottom-chrome-host');
            if (!overlay) {
                return fallbackBottom;
            }
            const rect = overlay.getBoundingClientRect();
            if (rect.height <= 0 || rect.top >= fallbackBottom) {
                return fallbackBottom;
            }
            return rect.top;
        };
    }

    onStop(_app: FrontendApplication): void {
        SelectComponent.overlayClipBottomProvider = undefined;
    }
}
