# AI Agent Usage

## Overview

The Contract Obligation and Renewal Assistant uses a Groq-powered large language model (LLM) to assist with contract analysis. The AI helps identify important contract information and potential obligations for user review.

## AI Workflow

1. The user uploads a PDF or DOCX contract.
2. The backend extracts the document text.
3. The extracted text is submitted to the configured Groq model for analysis.
4. The model returns structured contract information, such as parties, key terms, and obligations.
5. The application presents the results to the user.
6. The user reviews the results before saving or acting on important information.

## Human Approval

AI-generated information may be incomplete or incorrect. Important decisions should remain under human control.

- Users should review extracted obligations before relying on them.
- Approval or rejection decisions should be made by the user.
- Renewal and notice dates should be checked against the original contract.
- AI output should not automatically be treated as legally verified information.

## Error Handling and Reliability

- Invalid or unsupported documents should be handled by the backend.
- AI service failures should be reported to the user.
- Missing or uncertain contract information should be checked against the source document.
- Database operations should report failures rather than silently claiming success.

## Privacy and Security

- Keep the Groq API key and database credentials in environment variables.
- Never commit `.env` files or secrets to version control.
- Avoid sending confidential contract data to external AI services without authorization.
- Restrict access to uploaded contracts and saved contract records appropriately.

## Limitations

- AI may misinterpret legal language, dates, or obligations.
- Extracted text may omit information from scanned or poorly formatted documents.
- AI-generated analysis is not a substitute for professional legal review.
- Human verification is required before relying on important contract decisions.

## Testing Recommendations

Test document extraction, AI analysis, saving contracts, approving and rejecting obligations, renewal alerts, notice deadlines, and contract deletion. Include invalid files and AI-service failure scenarios.
