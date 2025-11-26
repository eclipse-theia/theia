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

export const ChatAgentRecommendationService = Symbol('ChatAgentRecommendationService');

export interface RecommendedAgent {
    readonly id: string;
    readonly label: string;
    readonly description?: string;
}

/**
 * Service that provides recommended chat agents to be displayed in the welcome screen.
 * This allows different Theia-based products to customize which agents are shown as quick actions.
 */
export interface ChatAgentRecommendationService {
    /**
     * Returns the list of recommended agents to display in the welcome screen.
     * These agents will be shown as quick-action buttons that users can click to set as default.
     */
    getRecommendedAgents(): RecommendedAgent[];
}
