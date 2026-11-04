// *****************************************************************************
// Copyright (C) 2019 Arm and others.
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

import { ContainerModule, interfaces } from '@theia/core/shared/inversify';
import { bindDynamicLabelProvider } from './label/sample-dynamic-label-provider-command-contribution.js';
import { bindSampleFilteredCommandContribution } from './contribution-filter/sample-filtered-command-contribution.js';
import { bindSampleUnclosableView } from './view/sample-unclosable-view-contribution.js';
import { bindSampleOutputChannelWithSeverity } from './output/sample-output-channel-with-severity.js';
import { bindSampleMenu } from './menu/sample-menu-contribution.js';
import { bindSampleFileWatching } from './file-watching/sample-file-watching-contribution.js';
import { bindVSXCommand } from './vsx/sample-vsx-command-contribution.js';
import { bindSampleToolbarContribution } from './toolbar/sample-toolbar-contribution.js';

import '../../src/browser/style/branding.css';
import { bindMonacoPreferenceExtractor } from './monaco-editor-preferences/monaco-editor-preference-extractor.js';
import { rebindOVSXClientFactory } from '../common/vsx/sample-ovsx-client-factory.js';
import { bindSampleAppInfo } from './vsx/sample-frontend-app-info.js';
import { bindTestSample } from './test/sample-test-contribution.js';
import { bindSampleFileSystemCapabilitiesCommands } from './file-system/sample-file-system-capabilities.js';
import { bindChatNodeToolbarActionContribution } from './chat/chat-node-toolbar-action-contribution.js';
import { bindAskAndContinueChatAgentContribution } from './chat/ask-and-continue-chat-agent-contribution.js';
import { bindChangeSetChatAgentContribution } from './chat/change-set-chat-agent-contribution.js';
import { bindModeChatAgentContribution } from './chat/mode-chat-agent-contribution.js';
import { bindOriginalStateTestAgentContribution } from './chat/original-state-test-agent-contribution.js';
import { bindCustomResponseContentRendererContribution } from './chat/custom-response-content-agent-contribution.js';
import { bindSampleChatCommandContribution } from './chat/sample-chat-command-contribution.js';
import { bindSampleCodeCompletionVariableContribution } from './ai-code-completion/sample-code-completion-variable-contribution.js';
import { bindSampleChatNodeToolbarPreferences } from './chat/sample-chat-node-toolbar-preferences.js';
import { bindSampleChatToolbarConfigurationCategory } from './ai-configuration/sample-chat-toolbar-configuration-category.js';
import { bindSamplePreferenceContribution } from './preferences/sample-preferences-contribution.js';
import { MCPFrontendContribution } from '@theia/ai-mcp-server/lib/browser/mcp-frontend-contribution';
import { SampleFrontendMCPContribution } from './mcp/sample-frontend-mcp-contribution.js';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { CommandContribution } from '@theia/core/lib/common';
import { ResolveMcpFrontendContribution } from './mcp/resolve-frontend-mcp-contribution.js';
import { TelemetrySampleCommandContribution } from './telemetry-sample/telemetry-sample-command-contribution.js';

export default new ContainerModule((
    bind: interfaces.Bind,
    unbind: interfaces.Unbind,
    isBound: interfaces.IsBound,
    rebind: interfaces.Rebind,
) => {
    bindAskAndContinueChatAgentContribution(bind);
    bindChangeSetChatAgentContribution(bind);
    bindModeChatAgentContribution(bind);
    bindOriginalStateTestAgentContribution(bind);
    bindCustomResponseContentRendererContribution(bind);
    bindChatNodeToolbarActionContribution(bind);
    bindSampleChatCommandContribution(bind);
    bindDynamicLabelProvider(bind);
    bindSampleUnclosableView(bind);
    bindSampleOutputChannelWithSeverity(bind);
    bindSampleMenu(bind);
    bindSampleFileWatching(bind);
    bindVSXCommand(bind);
    bindSampleFilteredCommandContribution(bind);
    bindSampleToolbarContribution(bind, rebind);
    bindMonacoPreferenceExtractor(bind);
    bindSampleAppInfo(bind);
    bindTestSample(bind);
    bindSampleFileSystemCapabilitiesCommands(bind);
    rebindOVSXClientFactory(rebind);
    bindSampleCodeCompletionVariableContribution(bind);
    bindSampleChatNodeToolbarPreferences(bind);
    bindSampleChatToolbarConfigurationCategory(bind);
    bindSamplePreferenceContribution(bind);
    bind(CommandContribution).to(TelemetrySampleCommandContribution).inSingletonScope();
    bind(MCPFrontendContribution).to(SampleFrontendMCPContribution).inSingletonScope();
    bind(ResolveMcpFrontendContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ResolveMcpFrontendContribution);
});
