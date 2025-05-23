// Start of new super-coder-agent.ts content
import {
    AbstractStreamParsingChatAgent,
    ChatAgentLocation,
    ChatRequestModel,
    ChatService,
    ChatSession,
    LanguageModelRequirement,
    MarkdownChatResponseContentImpl, // Added
    MutableChatModel,
    MutableChatRequestModel,
    ToolCallResponseChatResponseContentImpl, // Added for potential future use
    ChatSessionRole // Added for plan generation messages
} from '@theia/ai-chat/lib/common';
import { Agent, ChatAgent } from '@theia/ai-chat/lib/common/chat-agent';
import { PromptTemplate, LanguageModelService } from '@theia/ai-core'; // Added LanguageModelService
import { inject, injectable } from '@theia/core/shared/inversify';
import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering';
import { AI_CHAT_NEW_CHAT_WINDOW_COMMAND, ChatCommands } from '@theia/ai-chat-ui/lib/browser/chat-view-commands';
import * as nls from 'vscode-nls';
import { GET_WORKSPACE_DIRECTORY_STRUCTURE_FUNCTION_ID, GET_WORKSPACE_FILE_LIST_FUNCTION_ID, FILE_CONTENT_FUNCTION_ID } from '../common/workspace-functions';
import { WriteChangeToFileProvider, ReplaceContentInFileProvider } from './file-changeset-functions';
import { SUPER_CODER_SYSTEM_PROMPT_ID, getSuperCoderSystemPrompt } from '../common/super-coder-prompts';

const localize = nls.loadMessageBundle();

@injectable()
export class SuperCoderAgent extends AbstractStreamParsingChatAgent implements Agent, ChatAgent {
    public static readonly SUPER_CODER_PURPOSE = 'super-coding';
    private static readonly AUTONOMOUS_MODE_TRIGGER = '/autonomous';
    private static readonly AUTONOMOUS_MODE_TRIGGER_SHORT = '/auto'; // Short alias

    // Internal state for autonomous mode
    private isInAutonomousMode: boolean = false;
    private autonomousPlan: string[] = [];
    private currentAutonomousStep: number = 0;
    private awaitingPlanApproval: boolean = false;
    private originalTaskDescription: string = ''; // Store the original task

    id: string = 'SuperCoder';
    name: string = 'Super Coder';
    description: string = localize('superCoderAgent.description', 'An advanced AI assistant for complex coding tasks, planning, and autonomous operations. Type /autonomous [your task] to initiate.');
    iconClass: string = 'codicon codicon-beaker-stop'; // Consider a different icon for autonomous mode? codicon-robot?
    locations: ChatAgentLocation[] = ChatAgentLocation.ALL;

    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: SuperCoderAgent.SUPER_CODER_PURPOSE,
        identifier: 'openai/gpt-4o', // Default model
    }];
    protected defaultLanguageModelPurpose: string = SuperCoderAgent.SUPER_CODER_PURPOSE;

    override promptTemplates: PromptTemplate[] = [getSuperCoderSystemPrompt()];
    protected override systemPromptId: string | undefined = SUPER_CODER_SYSTEM_PROMPT_ID;

    override functions = [
        GET_WORKSPACE_DIRECTORY_STRUCTURE_FUNCTION_ID,
        GET_WORKSPACE_FILE_LIST_FUNCTION_ID,
        FILE_CONTENT_FUNCTION_ID,
        WriteChangeToFileProvider.ID,
        ReplaceContentInFileProvider.ID
    ];

    @inject(ChatService) protected readonly chatService: ChatService;
    @inject(LanguageModelService) protected readonly languageModelService: LanguageModelService;

    override async invoke(request: MutableChatRequestModel): Promise<void> {
        const userMessage = request.message.text.trim();

        if (this.awaitingPlanApproval) {
            const affirmativeResponses = ['yes', 'ok', 'okay', 'proceed', 'approve', 'y'];
            const negativeResponses = ['no', 'cancel', 'stop', 'n'];

            if (affirmativeResponses.includes(userMessage.toLowerCase())) {
                this.awaitingPlanApproval = false;
                this.isInAutonomousMode = true;
                this.currentAutonomousStep = 0; // Reset step count
                request.response.response.addContent(new MarkdownChatResponseContentImpl("Great! Starting autonomous execution of the plan. I will update you on each step. You can say 'stop' or 'cancel' to interrupt at any time."));
                request.response.complete(); // Complete this response turn
                // Create a new request to kick off the first step execution
                const firstStepRequest = this.chatService.createRequest(request.session.id, ''); // Empty message, execution logic will use plan
                this.executeCurrentPlanStep(firstStepRequest); // No await here, let it run
            } else if (negativeResponses.includes(userMessage.toLowerCase())) {
                this.awaitingPlanApproval = false;
                this.isInAutonomousMode = false;
                this.autonomousPlan = [];
                this.currentAutonomousStep = 0;
                this.originalTaskDescription = '';
                request.response.response.addContent(new MarkdownChatResponseContentImpl("Okay, I will not proceed with the plan. What would you like to do instead?"));
                request.response.complete();
            } else {
                request.response.response.addContent(new MarkdownChatResponseContentImpl("Please respond with 'yes' (or 'ok', 'proceed') to approve the plan, or 'no' (or 'cancel') to reject it."));
                request.response.complete();
            }
            return;
        }

        if (this.isInAutonomousMode) {
            const interruptionCommands = ['stop', 'cancel', 'interrupt', 'halt'];
            if (interruptionCommands.includes(userMessage.toLowerCase())) {
                this.isInAutonomousMode = false;
                const oldPlan = [...this.autonomousPlan];
                const oldStep = this.currentAutonomousStep;
                this.autonomousPlan = [];
                this.currentAutonomousStep = 0;
                this.originalTaskDescription = '';
                let stopMessage = "Autonomous mode stopped by user.";
                if (oldPlan.length > 0 && oldStep < oldPlan.length) {
                    stopMessage += `\nI was about to execute step ${oldStep +1}: "${oldPlan[oldStep]}"`;
                }
                request.response.response.addContent(new MarkdownChatResponseContentImpl(stopMessage + "\nWhat would you like to do next?"));
                request.response.complete();
            } else {
                // While in autonomous mode, generally ignore other user messages unless they are interruptions.
                // The agent is focused on executing its plan.
                // We could add a message here like "Currently in autonomous mode. To interrupt, say 'stop'."
                // For now, if a step is executing and generating a response, this new message might get interleaved or lost.
                // This part needs careful thought in a multi-turn conversational autonomous execution.
                // For this version, we'll assume executeCurrentPlanStep handles responses for its own operations.
                // If the user types something while a step is processing, it might be ignored or cause confusion.
                // A simple acknowledgement:
                if (userMessage) { // if user actually said something
                    request.response.response.addContent(new MarkdownChatResponseContentImpl("I am currently executing an autonomous plan. To interrupt, please say 'stop' or 'cancel'. Your message has been noted but I will continue with the current step."));
                    request.response.complete(); // Complete this immediate response. The autonomous execution continues separately.
                }
                // Do not return here if userMessage was empty, as an autonomous step might be concluding.
            }
            return; // In autonomous mode, the main flow is driven by executeCurrentPlanStep, not direct user invokes for tasks.
        }

        const trigger = userMessage.toLowerCase().startsWith(SuperCoderAgent.AUTONOMOUS_MODE_TRIGGER + ' ') ? SuperCoderAgent.AUTONOMOUS_MODE_TRIGGER
                      : userMessage.toLowerCase().startsWith(SuperCoderAgent.AUTONOMOUS_MODE_TRIGGER_SHORT + ' ') ? SuperCoderAgent.AUTONOMOUS_MODE_TRIGGER_SHORT
                      : null;

        if (trigger) {
            this.originalTaskDescription = userMessage.substring(trigger.length).trim();
            if (this.originalTaskDescription) {
                // Add a message that plan generation is starting.
                request.response.response.addContent(new MarkdownChatResponseContentImpl(`Received task for autonomous mode: "${this.originalTaskDescription}".\nGenerating a plan now...`));
                // Don't complete response yet, generateAndProposePlan will add to it.
                await this.generateAndProposePlan(request); // generateAndProposePlan will set awaitingPlanApproval and complete the request.response
            } else {
                request.response.response.addContent(new MarkdownChatResponseContentImpl(`Please provide a task description after '${trigger}'. For example: ${trigger} refactor the user service.`));
                request.response.complete();
            }
            return;
        }

        // Default behavior: normal chat processing using the main system prompt
        await super.invoke(request);
        if (!this.isInAutonomousMode && !this.awaitingPlanApproval) {
            this.suggest(request);
        }
    }

    private async generateAndProposePlan(request: MutableChatRequestModel): Promise<void> {
        // Use a specific prompt for plan generation, not the main system prompt directly for this call.
        const planGenerationSystemMessage = `You are an expert at breaking down complex software development tasks into a sequence of smaller, manageable steps.
Given a task, your role is to generate a concise, numbered, step-by-step plan.
Return *only* the numbered list of steps, with each step on a new line. Each step must be a clear, actionable instruction.
Do not include any other explanatory text, greetings, or summaries before or after the list.
The plan should be detailed enough to be executed by another AI agent with access to file system tools.
Consider steps like reading files, analyzing code, identifying specific changes, using tools to apply changes, and verifying outcomes if possible.
If the task is vague, make reasonable assumptions or include steps to clarify ambiguity (e.g., 'Clarify specific requirements for X with the user' - though for full autonomy, try to avoid this if possible).`;

        const planGenerationUserMessage = `Generate a step-by-step plan for the following task: ${this.originalTaskDescription}`;

        const planGenerationMessages = [
            { role: ChatSessionRole.SYSTEM, content: planGenerationSystemMessage },
            { role: ChatSessionRole.USER, content: planGenerationUserMessage }
        ];

        try {
            const lmRequest = {
                modelId: this.languageModelRequirements[0].identifier,
                messages: planGenerationMessages,
                // Additional parameters like temperature can be set if needed.
                // 'max_tokens' could be important for plan length.
                // No 'tool_choice' or 'tools' here; we expect a text response (the plan).
            };
            const lmResponse = await this.languageModelService.sendRequest(lmRequest);

            let rawPlan = '';
            if (lmResponse && lmResponse.choices && lmResponse.choices.length > 0 && lmResponse.choices[0].message) {
                rawPlan = lmResponse.choices[0].message.content || '';
            } else {
                throw new Error('LLM response for plan generation was empty or malformed.');
            }

            // Parse the plan: split by newline, filter empty lines, ensure it looks like a numbered step, then remove the numbering.
            this.autonomousPlan = rawPlan.split('\n')
                .map(step => step.trim())
                .filter(step => /^\d+\.\s*.+/.test(step)) // Ensure it starts with "1. ", "2. ", etc.
                .map(step => step.replace(/^\d+\.\s*/, '')); // Remove the "1. " part

            if (this.autonomousPlan.length === 0) {
                 // Append to existing response
                request.response.response.addContent(new MarkdownChatResponseContentImpl("\n\nI couldn't generate a valid plan for that task. The LLM returned: \n```\n" + rawPlan + "\n```\nPlease try rephrasing or be more specific."));
                this.originalTaskDescription = ''; // Clear task
            } else {
                let planMessage = "\n\nOkay, I've generated the following plan:\n\n";
                this.autonomousPlan.forEach((step, index) => {
                    planMessage += `${index + 1}. ${step}\n`;
                });
                planMessage += "\nDo you want me to proceed with this plan? (yes/no)";
                 // Append to existing response
                request.response.response.addContent(new MarkdownChatResponseContentImpl(planMessage));
                this.awaitingPlanApproval = true;
            }
        } catch (error) {
            console.error('Error during plan generation:', error);
            request.response.response.addContent(new MarkdownChatResponseContentImpl(`\n\nSorry, I encountered an error while trying to generate a plan: ${error.message}`));
            this.originalTaskDescription = ''; // Clear task
        } finally {
            request.response.complete(); // Complete the turn, whether plan succeeded or failed.
        }
    }

    private async executeCurrentPlanStep(execRequest: MutableChatRequestModel): Promise<void> {
        if (!this.isInAutonomousMode) { // Check if mode was stopped while this was scheduled
            if (!execRequest.response.isComplete()) {
                execRequest.response.response.addContent(new MarkdownChatResponseContentImpl("Autonomous mode was stopped. Aborting further step execution."));
                execRequest.response.complete();
            }
            return;
        }

        if (this.currentAutonomousStep >= this.autonomousPlan.length) {
            execRequest.response.response.addContent(new MarkdownChatResponseContentImpl("Autonomous plan complete! All steps have been executed."));
            this.isInAutonomousMode = false;
            this.autonomousPlan = [];
            this.currentAutonomousStep = 0;
            this.originalTaskDescription = '';
            execRequest.response.complete();
            this.suggest(execRequest); // Offer suggestions now that autonomous mode is done.
            return;
        }

        const stepDescription = this.autonomousPlan[this.currentAutonomousStep];
        const stepAnnouncement = `\n\n**Executing Step ${this.currentAutonomousStep + 1}/${this.autonomousPlan.length}:** ${stepDescription}\n\nWorking on it...`;
        execRequest.response.response.addContent(new MarkdownChatResponseContentImpl(stepAnnouncement));
        // The response is NOT completed here. super.invoke for the step will append to it and complete it.

        // Use the main system prompt for step execution, as steps might involve any agent capability.
        const stepSystemPrompt = this.getPrompt(execRequest.session, this.systemPromptId);
        if (!stepSystemPrompt) {
            execRequest.response.response.addContent(new MarkdownChatResponseContentImpl("Error: System prompt not found. Cannot execute step. Autonomous mode stopped."));
            execRequest.response.complete();
            this.isInAutonomousMode = false;
            return;
        }

        // This is a critical part: the step description becomes the "user message" for super.invoke
        // We need to ensure that super.invoke uses the correct system prompt (the main one)
        // and that the tools are available.
        // We also need to handle the response correctly. super.invoke will try to complete execRequest.response.

        // We modify the execRequest's message in place for super.invoke.
        // This is okay because execRequest is specific to this step's execution.
        execRequest.message = {
            text: `Task: ${this.originalTaskDescription}\n\nCurrent Step: ${stepDescription}\n\nExecute this step. If you use tools that create changesets, inform the user as per your instructions.`,
            author: execRequest.message.author, // Keep original session author
            timestamp: Date.now()
        };

        try {
            // `super.invoke` will handle the LLM call, tool usage, and appending to `execRequest.response`.
            // It will also complete `execRequest.response` when the LLM finishes its turn for the step.
            await super.invoke(execRequest);

            // After super.invoke completes (i.e., the step's LLM interaction is done):
            if (!this.isInAutonomousMode) { // Check if mode was stopped during the step's execution
                console.log("Autonomous mode stopped during step execution, not proceeding to next step.");
                return; // execRequest.response should have been completed by stop logic or super.invoke
            }
            
            this.currentAutonomousStep++;

            // Check for pending changesets. This is a simple notification.
            // A more advanced version might require explicit approval before continuing.
            if (execRequest.session.changeSet && execRequest.session.changeSet.elements.length > 0 && execRequest.session.changeSet.elements.some(e => e.state === 'pending')) {
                // This message will be part of the *next* turn, or potentially lost if not handled carefully.
                // For now, let's assume the LLM's output from the step (via super.invoke) is the primary feedback.
                // We can add a small note at the *beginning* of the next step's announcement.
                // This is a known simplification for Part 1.
                console.log("Changeset pending after step completion. Plan will continue.");
            }

            // Schedule the next step. setTimeout allows the current turn (response from super.invoke) to fully flush.
            setTimeout(() => {
                if (this.isInAutonomousMode) { // Double check mode hasn't been turned off
                    const nextStepRequest = this.chatService.createRequest(execRequest.session.id, ''); // New request for the next step
                    if (execRequest.session.changeSet && execRequest.session.changeSet.elements.length > 0 && execRequest.session.changeSet.elements.some(e => e.state === 'pending')) {
                        nextStepRequest.response.response.addContent(new MarkdownChatResponseContentImpl("*Please note: A changeset was proposed in the previous step. Review and apply/discard it as needed. The plan continues...*\n"));
                    }
                    this.executeCurrentPlanStep(nextStepRequest);
                }
            }, 0); // Small delay to ensure current HTTP response cycle for the completed step can finish.

        } catch (error) {
            console.error(`Error executing step '${stepDescription}':`, error);
            // Ensure the response for the current step is completed even on error.
            if (!execRequest.response.isComplete()) {
                execRequest.response.response.addContent(new MarkdownChatResponseContentImpl(`Error during step execution: ${error.message}.`));
                execRequest.response.complete();
            }
            // Create a new, separate response for the error message and stopping.
            const errorRequest = this.chatService.createRequest(execRequest.session.id, '');
            errorRequest.response.response.addContent(new MarkdownChatResponseContentImpl(`Autonomous mode stopped due to an error in the previous step.`));
            errorRequest.response.complete();

            this.isInAutonomousMode = false;
            this.autonomousPlan = [];
            this.currentAutonomousStep = 0;
            this.originalTaskDescription = '';
            this.suggest(errorRequest); // Offer suggestions
        }
    }

    async suggest(context: ChatSession | ChatRequestModel): Promise<void> {
        const contextIsRequest = ChatRequestModel.is(context);
        const model = contextIsRequest ? context.session : context.model;
        const session = contextIsRequest ? this.chatService.getSessions().find(candidate => candidate.model.id === model.id) : context;
        if (!(model instanceof MutableChatModel) || !session) { return; }

        if (this.isInAutonomousMode || this.awaitingPlanApproval) {
            // No suggestions while in autonomous mode or awaiting plan approval
            model.setSuggestions([]);
            return;
        }

        if (model.isEmpty()) {
            model.setSuggestions([
                {
                    kind: 'callback',
                    callback: () => this.chatService.sendRequest(session.id, { text: `${SuperCoderAgent.AUTONOMOUS_MODE_TRIGGER} Please analyze the project structure and suggest improvements.` }),
                    content: `[${SuperCoderAgent.AUTONOMOUS_MODE_TRIGGER} Analyze project & suggest improvements](_callback)`
                },
                {
                    kind: 'callback',
                    callback: () => this.chatService.sendRequest(session.id, { text: '@SuperCoder what can you do?' }),
                    content: '[What can you do?](_callback)'
                },
            ]);
        } else {
            // Standard "new chat" suggestions
            model.setSuggestions([
                new MarkdownStringImpl(`Keep chats focused. [Start New Chat](command:${AI_CHAT_NEW_CHAT_WINDOW_COMMAND.id}) for a new task.`),
                new MarkdownStringImpl(`[New Chat with Summary](command:${ChatCommands.AI_CHAT_NEW_WITH_TASK_CONTEXT.id}) of this one.`)
            ]);
        }
    }
}
// End of new super-coder-agent.ts content
