/* eslint-disable max-len */

// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { LanguageModelRequirement, BasePromptFragment, AIVariableContext } from '@theia/ai-core/lib/common';
import { injectable, inject } from '@theia/core/shared/inversify';
import { AbstractStreamParsingChatAgent, SystemMessageDescription } from '@theia/ai-chat/lib/common/chat-agents';
import { nls } from '@theia/core';
import { CHAT_CONTEXT_DETAILS_VARIABLE_ID } from '@theia/ai-chat';
import { MCPFrontendService } from '@theia/ai-mcp/lib/common/mcp-server-manager';

export const EXPECTED_MCP_SERVER_NAME = 'playwright';

// Prompt templates
export const appTesterTemplate: BasePromptFragment = {
   id: 'app-tester-system-default',
   template: `{{!-- This prompt is licensed under the MIT License (https://opensource.org/license/mit).
Made improvements or adaptations to this prompt template? We'd love for you to share it with the community! Contribute back here:
https://github.com/eclipse-theia/theia/discussions/new?category=prompt-template-contribution --}}

You are AppTester, an AI assistant integrated into Theia IDE specifically designed to help developers test running applications using Playwright.
Your role is to inspect the application for user-specified test scenarios through the Playwright MCP server.

## Your Workflow
1. Help the user build and launch their application
2. Use Playwright browser automation to validate test scenarios
3. Report results and provide actionable feedback 
4. Help fix issues when needed

## Available Playwright Testing Tools
You have access to these powerful automation tools: {{prompt:mcp_${EXPECTED_MCP_SERVER_NAME}_tools}}

## Workflow Approach
1. **Understand Requirements**: Ask the user to clearly define what needs to be tested
2. **Launch Browser**: Start a fresh browser instance for testing
3. **Navigate and Test**: Execute the test scenario methodically
4. **Document Results**: Provide detailed results with screenshots when helpful
5. **Clean Up**: Always close the browser when testing is complete

## Current Context
Some files and other pieces of data may have been added by the user to the context of the chat. If any have, the details can be found below.
{{${CHAT_CONTEXT_DETAILS_VARIABLE_ID}}}
`
};

export const appTesterTemplateVariant: BasePromptFragment = {
   id: 'app-tester-system-empty',
   template: '',
};

export const AppTesterChatAgentId = 'AppTester';
@injectable()
export class AppTesterChatAgent extends AbstractStreamParsingChatAgent {
   @inject(MCPFrontendService)
   protected readonly mcpService: MCPFrontendService;

   id: string = AppTesterChatAgentId;
   name = AppTesterChatAgentId;
   languageModelRequirements: LanguageModelRequirement[] = [{
      purpose: 'chat',
      identifier: 'openai/gpt-4o',
   }];
   protected defaultLanguageModelPurpose: string = 'chat';
   override description = nls.localize('theia/ai/chat/app-tester/description', 'This agent tests your application user interface to verify user-specified test scenarios through the Playwright MCP server. '
      + 'It can automate testing workflows and provide detailed feedback on application functionality.');

   override iconClass: string = 'codicon codicon-beaker';
   protected override systemPromptId: string = 'app-tester-prompt';
   override prompts = [{ id: 'app-tester-prompt', defaultVariant: appTesterTemplate, variants: [appTesterTemplateVariant] }];

   protected override async getSystemMessageDescription(context: AIVariableContext): Promise<SystemMessageDescription | undefined> {
      try {
         // Make sure the Playwright MCP server is running before any tool is called
         await this.startPlaywrightMCPServer();
      } catch (error) {
         this.logger.warn(`Failed to start Playwright MCP server before processing request: ${error}`);
         // Continue with processing even if MCP server start failed
      }
      return super.getSystemMessageDescription(context);
   }

   /**
    * Starts the Playwright MCP server if it doesn't exist or isn't running.
    *
    * @returns A promise that resolves when the server is started
    */
   async startPlaywrightMCPServer(): Promise<void> {
      try {
         const startedServers = await this.mcpService.getStartedServers();
         if (startedServers.includes(EXPECTED_MCP_SERVER_NAME)) {
            return;
         }

         const availableServers = await this.mcpService.getServerNames();
         if (!availableServers.includes(EXPECTED_MCP_SERVER_NAME)) {
            await this.mcpService.addOrUpdateServer({
               name: EXPECTED_MCP_SERVER_NAME,
               command: 'npx',
               args: ['-y', '@playwright/mcp@latest'],
               env: {},
            });
         }
         await this.mcpService.startServer(EXPECTED_MCP_SERVER_NAME);
      } catch (error) {
         this.logger.error(`Error starting Playwright MCP server: ${error}`);
         throw error;
      }
   }
}
