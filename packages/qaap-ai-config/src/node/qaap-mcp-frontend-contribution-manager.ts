// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { MCPFrontendContributionManager } from '@theia/ai-mcp-server/lib/node/mcp-frontend-contribution-manager';

@injectable()
export class QaapMCPFrontendContributionManager extends MCPFrontendContributionManager {

    protected override prepareDelegateReregistration(delegateId: string): void {
        this.unregisterFrontendContributionsFromDelegate(delegateId);
    }

    protected override toRegisteredResourceUri(resourceUri: string, delegateId: string): string {
        return `${resourceUri}#mcp-delegate-${delegateId}`;
    }

    protected override toOriginalResourceUri(href: string): string {
        return href.replace(/#mcp-delegate-[^#]+$/, '');
    }
}
