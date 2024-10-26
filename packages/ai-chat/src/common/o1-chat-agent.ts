import {
    ChatAgent,
    ChatAgentLocation,
    AbstractStreamParsingChatAgent,
    SystemMessageDescription
} from './chat-agents'; // Adjust the import path as necessary

import { injectable } from '@theia/core/shared/inversify';
import { AgentSpecificVariables, PromptTemplate } from '@theia/ai-core';


@injectable()
export class O1ChatAgent extends AbstractStreamParsingChatAgent implements ChatAgent {


    readonly variables: string[];
    readonly functions: string[] = [];
    public name = 'O1-Preview';
    public description = 'An agent for interacting with ChatGPT o1-preview';
    public promptTemplates: PromptTemplate[] = [];
    public defaultModel = 'o1-preview';
    readonly agentSpecificVariables: AgentSpecificVariables[] = [];


    constructor() {
        super(
            'o1-preview',
            [{
                purpose: 'chat',
                identifier: 'openai/o1-preview',
            }],
            'chat',
            'codicon codicon-chat',
            ChatAgentLocation.ALL,
            ['Chat'],
            true
        );
        this.agentSpecificVariables = [];
        this.variables = [];
    }

    protected async getSystemMessageDescription(): Promise<SystemMessageDescription | undefined> {
        // O1 currently does not support system prompts
        return undefined;
    }
}
