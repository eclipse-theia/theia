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

import { CHAT_CONTEXT_DETAILS_VARIABLE_ID } from '@theia/ai-chat';
import { AbstractStreamParsingChatAgent } from '@theia/ai-chat/lib/common/chat-agents';
import { ErrorChatResponseContentImpl, MarkdownChatResponseContentImpl, MutableChatRequestModel, QuestionResponseContentImpl } from '@theia/ai-chat/lib/common/chat-model';
import { BasePromptFragment, LanguageModelRequirement } from '@theia/ai-core/lib/common';
import { MCPFrontendService, MCPServerDescription } from '@theia/ai-mcp/lib/common/mcp-server-manager';
import { nls } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MCP_SERVERS_PREF } from '@theia/ai-mcp/lib/browser/mcp-preferences';
import { PreferenceScope, PreferenceService } from '@theia/core/lib/browser';

export const REQUIRED_MCP_SERVERS: MCPServerDescription[] = [
   {
      name: 'playwright',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
      autostart: false,
      env: {},
   },
   {
      name: 'playwright-visual',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest', '--vision'],
      autostart: false,
      env: {},
   }
];

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
You have access to these powerful automation tools:
${REQUIRED_MCP_SERVERS.map(server => `{{prompt:mcp_${server.name}_tools}}`)}

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

   @inject(PreferenceService)
   protected readonly preferenceService: PreferenceService;

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
   protected override systemPromptId: string = 'app-tester-system';
   override prompts = [{ id: 'app-tester-system', defaultVariant: appTesterTemplate, variants: [appTesterTemplateVariant] }];

   /**
    * Override invoke to check if the Playwright MCP server is running, and if not, ask the user if it should be started.
    */
   override async invoke(request: MutableChatRequestModel): Promise<void> {
      try {
         if (await this.requiresStartingServers()) {
            // Ask the user if they want to start the server
            request.response.response.addContent(new QuestionResponseContentImpl(
               'The Playwright MCP servers are not running. Would you like to start them now? This may install the Playwright MCP servers.',
               [
                  { text: 'Yes, start the servers', value: 'yes' },
                  { text: 'No, cancel', value: 'no' }
               ],
               request,
               async selectedOption => {
                  if (selectedOption.value === 'yes') {
                     // Show progress
                     const progress = request.response.addProgressMessage({ content: 'Starting Playwright MCP servers.', show: 'whileIncomplete' });
                     try {
                        await this.startServers();
                        // Remove progress, continue with normal flow
                        request.response.updateProgressMessage({ ...progress, show: 'whileIncomplete', status: 'completed' });
                        await super.invoke(request);
                     } catch (error) {
                        request.response.response.addContent(new ErrorChatResponseContentImpl(
                           new Error('Failed to start Playwright MCP server: ' + (error instanceof Error ? error.message : String(error)))
                        ));
                        request.response.complete();
                     }
                  } else {
                     // Continue without starting the server
                     request.response.response.addContent(new MarkdownChatResponseContentImpl('Please setup the MCP servers.'));
                     request.response.complete();
                  }
               }
            ));
            request.response.waitForInput();
            return;
         }
         // If already running, continue as normal
         await super.invoke(request);
      } catch (error) {
         request.response.response.addContent(new ErrorChatResponseContentImpl(
            new Error('Error checking Playwright MCP server status: ' + (error instanceof Error ? error.message : String(error)))
         ));
         request.response.complete();
      }
   }

   protected async requiresStartingServers(): Promise<boolean> {
      const allStarted = await Promise.all(REQUIRED_MCP_SERVERS.map(server => this.mcpService.isServerStarted(server.name)));
      return allStarted.some(started => !started);
   }

   protected async startServers(): Promise<void> {
      await Promise.all(REQUIRED_MCP_SERVERS.map(server => this.ensureServerStarted(server)));

   }

   /**
    * Starts the Playwright MCP server if it doesn't exist or isn't running.
    *
    * @returns A promise that resolves when the server is started
    */
   async ensureServerStarted(server: MCPServerDescription): Promise<void> {
      try {
         if ((await this.mcpService.isServerStarted(server.name))) {
            return;
         }
         if (!(await this.mcpService.hasServer(server.name))) {
            const currentServers = this.preferenceService.get<Record<string, MCPServerDescription>>(MCP_SERVERS_PREF, {});
            await this.preferenceService.set(MCP_SERVERS_PREF, { ...currentServers, server }, PreferenceScope.User);
            await this.mcpService.addOrUpdateServer(server);
         }
         await this.mcpService.startServer(server.name);
      } catch (error) {
         this.logger.error(`Error starting MCP server ${server.name}: ${error}`);
         throw error;
      }
   }
}
