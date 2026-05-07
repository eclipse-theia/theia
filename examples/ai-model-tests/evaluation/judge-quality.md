You are evaluating an AI coding assistant's response to a software engineering task.

## Task Given to the Assistant

{{prompt}}

## Expected Behavior

{{expected_behavior}}

## Assistant's Response

{{response}}

## Your Evaluation

Evaluate the assistant's response on the following criteria:
- **Correctness**: Does the response correctly address the task?
- **Code quality**: Is the generated code syntactically correct, well-structured, and following good practices?
- **Completeness**: Does the response cover all aspects of the expected behavior?
- **Relevance**: Does the response stay focused on the task without unnecessary tangents?

Return ONLY valid JSON with no surrounding text or markdown:
{"score": <1-10>, "pass": <true if score >= 6>, "reasoning": "<2-3 sentences explaining the score>", "issues": ["<issue1>", "<issue2>"]}
