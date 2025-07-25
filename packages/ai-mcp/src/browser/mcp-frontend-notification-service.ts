// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { injectable } from '@theia/core/shared/inversify';
import { MCPFrontendNotificationService, MCPFrontendService, MCPServerDescription } from '../common';
import { Emitter, Event } from '@theia/core/lib/common/event';

@injectable()
export class MCPFrontendNotificationServiceImpl implements MCPFrontendNotificationService {
    protected readonly onDidUpdateMCPServersEmitter = new Emitter<void>();
    public readonly onDidUpdateMCPServers: Event<void> = this.onDidUpdateMCPServersEmitter.event;

    protected frontendMCPService: MCPFrontendService;

    didUpdateMCPServers(): void {
        this.onDidUpdateMCPServersEmitter.fire();
    }

    async resolveServerDescription(description: MCPServerDescription): Promise<MCPServerDescription> {
        if (this.frontendMCPService) {
            return this.frontendMCPService.resolveServerDescription(description);
        } else {
            console.warn('MCPFrontendService is not set, cannot resolve server description:', description);
            return description;
        }
    }

    setFrontendMCPService(service: MCPFrontendService): void {
        this.frontendMCPService = service;
    }
}
