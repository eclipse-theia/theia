/* eslint-disable @typescript-eslint/tslint/config */
// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
//
// This file is licensed under the MIT License.
// See LICENSE-MIT.txt in the project root for license information.
// https://opensource.org/license/mit.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************
import { PromptVariantSet } from '@theia/ai-core/lib/common';
import { TASK_CONTEXT_SUMMARY_VARIABLE_ID } from './context-variables';

export const TASK_CONTEXT_CREATE_PROMPT_ID = 'task-context-create';
export const TASK_CONTEXT_TEMPLATE_PROMPT_ID = 'task-context-template';
export const TASK_CONTEXT_UPDATE_PROMPT_ID = 'task-context-update';

export const taskContextSystemVariants = <PromptVariantSet>{
    id: TASK_CONTEXT_CREATE_PROMPT_ID,
    defaultVariant: {
        id: 'task-context-create-default',
        template: `{{!-- This prompt is licensed under the MIT License (https://opensource.org/license/mit).
Made improvements or adaptations to this prompt template? We'd love for you to share it with the community! Contribute back here:
https://github.com/eclipse-theia/theia/discussions/new?category=prompt-template-contribution --}}

Your task is to analyze the current chat session and summarize it to prepare to complete the coding task.
Your instructions should be complete. They are used by a coding agent.
Include all necessary information. 
Use unique identifiers such as file paths or URIs to artifacts.
Skip irrelevant information, e.g. for discussions, only sum up the final result.

## Instructions
1. Analyze the conversation carefully.
2. Identify the main coding objective and requirements.
3. Propose a clear approach to implement the requested functionality in task steps.
4. If any part of the task is ambiguous, note the ambiguity so that it can be clarified later.
5. If there are any relevant examples on how to implement something correctly, add them

Focus on providing actionable steps and implementation guidance. The coding agent needs practical help with this specific coding task.

Use the following template format:

{{prompt:${TASK_CONTEXT_TEMPLATE_PROMPT_ID}}}
`
    }
};

export const taskContextTemplateVariants = <PromptVariantSet>{
    id: TASK_CONTEXT_TEMPLATE_PROMPT_ID,
    defaultVariant: {
        id: 'task-context-template-default',
        template: `{{!-- This prompt is licensed under the MIT License (https://opensource.org/license/mit).
Made improvements or adaptations to this prompt template? We'd love for you to share it with the community! Contribute back here:
https://github.com/eclipse-theia/theia/discussions/new?category=prompt-template-contribution --}}

# Task Context: [Title Here]

---

## 1. 📚 Task Definition

**Problem Statement / Goal:**  
[Describe what needs to be achieved and why.]

**Scope:**  
- **In Scope:**  
  [Features, components, or behaviors to be included.]
- **Out of Scope:**  
  [What explicitly won't be part of this task.]

---

## 2. 🧠 Design and Implementation

**Design Overview:**  
[Summary of architecture and major design decisions.]

**Implementation Plan:**  
1. [First major step]
2. [Second major step]
3. [Third major step]

**Technology Choices:**  
- [Frameworks, libraries, services, tools]

**Files expected to be changed**
List all files that are expected to be changed (using relative file path) and quickly explain what is expected to be changed in this file.

### Examples

List all examples of existing code that are useful to understand the design and do the implementation.
These examples are not the files supposed to be changed, but code that shows how to implement specific things.
Prefer to mention files instead of adding their content.
Explain the purpose of every example.

---

## 3. 🧪 Testing

### 3.1 🛠️ Automated Testing (by Coder)

**Automated Test Strategy:**  
[What should be covered by automated tests.]

**Test Cases Implemented:**  
- [Unit test 1]
- [Integration test 1]
- [E2E test 1]

**Test Coverage Targets:**  
[e.g., Minimum 80% code coverage, all workflows tested.]

---

### 3.2 🎯 Manual Testing (by Tester)

**Manual Testing Strategy:**  
[What manual tests will focus on (e.g., usability, edge cases, exploratory testing).]

**Test Setup Instructions:**  
- [Environment setup steps, accounts needed, special configurations]

**Test Cases / Test Steps:**  
1. [Action 1]
2. [Action 2]
3. [Action 3]

**Expected Results:**  
- [Expected behavior at each step]

**Known Risks / Focus Areas:**  
- [Potential weak spots, UX concerns, edge cases]

---

## 4. 📦 Deliverables

**Expected Artifacts:**  
- [Code modules]
- [Documentation]
- [Configuration files]
- [Test reports]

**PR Information:**  
- **PR Title:** [Suggested title for the pull request]
- **PR Description:** [What was implemented, high-level changes, decisions]
- **Verification Steps:** [Instructions for verifying the PR manually or automatically]

**Additional Notes:**  
- [Dependencies]
- [Migration steps if needed]
- [Special reviewer instructions]

---

## 5. 🔄 Current Status

**Progress Summary:**  
[Short free-text update about how far the task has progressed.]

**Completed Items:**  
- [List of what has been fully implemented, tested, or merged.]

**Open Items:**  
- [List of remaining tasks, missing parts.]

**Current Issues / Risks:**  
- [Open problems, bugs found during testing, architectural blockers.]

**Next Steps:**  
- [Immediate action items, who should act next.]
`
    }
};

export const taskContextUpdateVariants = <PromptVariantSet>{
    id: TASK_CONTEXT_UPDATE_PROMPT_ID,
    defaultVariant: {
        id: 'task-context-update-default',
        template: `{{!-- This prompt is licensed under the MIT License (https://opensource.org/license/mit).
Made improvements or adaptations to this prompt template? We'd love for you to share it with the community! Contribute back here:
https://github.com/eclipse-theia/theia/discussions/new?category=prompt-template-contribution --}}
You are an AI assistant integrated into Theia IDE, designed to update task context files. You can interact provided task context file and propose changes.

# Task Document Update Instructions

You are an AI agent tasked with updating a technical document based on the current discussion. 
Your job is to provide the COMPLETE UPDATED DOCUMENT as your response, not commentary about the document.

## Analysis Requirements

1. **Review the Current Discussion**: 
   - Analyze the entire conversation
   - Identify new information, decisions, and changes

2. **Examine the Existing Document**: 
   - Understand its structure and purpose
   - Identify sections that need updates

3. **Update the Document**: 
   - Maintain the original structure and formatting
   - Add new information from the discussion
   - Update existing information
   - Remove outdated information if necessary
   - Ensure coherence and organization

## IMPORTANT: Response Format

YOUR ENTIRE RESPONSE MUST BE THE UPDATED DOCUMENT ONLY. Do not include:
- Any commentary about what you changed
- Introduction or explanation text
- Markdown fences or syntax indicators
- Clarifying questions

Simply output the complete updated document as plain text, which will directly replace the existing document.

## Guidelines

- Be thorough in capturing all relevant information
- Maintain the original document's style and tone
- Use clear, concise language
- Preserve all formatting from the original document
- Ensure technical accuracy in all updates

{{${TASK_CONTEXT_SUMMARY_VARIABLE_ID}}}
`
    }
};

