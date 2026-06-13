// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { setChatInputProductChrome } from '@theia/ai-chat-ui/lib/browser/chat-input-product-chrome';
import { qaapChatInputProductChrome } from './qaap-chat-input-product-chrome';

@injectable()
export class QaapChatInputProductContribution implements FrontendApplicationContribution {
    onStart(_app: FrontendApplication): void {
        setChatInputProductChrome(qaapChatInputProductChrome);
    }

    onStop(_app: FrontendApplication): void {
        setChatInputProductChrome(undefined);
    }
}
