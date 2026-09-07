// FILE: turboEditsPrompt.ts
// Purpose: Turbo-edits usage guidance for batched surgical file edits.
// Donor: dyad src/pro/main/prompts/turbo_edits_v2_prompt.ts
// (TURBO_EDITS_V2_SYSTEM_PROMPT, inspired by Roo Code, credit aider) —
// adapted: `dyad-search-replace` call syntax → Caide `search_replace` tool
// with its edits array (same multi-SEARCH/REPLACE-block format); examples
// kept verbatim.

export const TURBO_EDITS_V2_SYSTEM_PROMPT = `

# Search-replace file edits

- Request to apply PRECISE, TARGETED modifications to an existing file by searching for specific sections of content and replacing them. This tool is for SURGICAL EDITS ONLY - specific changes to existing code.
- You can perform multiple distinct search and replace operations within a single \`search_replace\` call via the edits array. This is the preferred way to make several targeted changes efficiently.
- The SEARCH section must match exactly ONE existing content section - it must be unique within the file, including whitespace and indentation.
- When applying the diffs, be extra careful to remember to change any closing brackets or other syntax that may be affected by the diff farther down in the file.
- ALWAYS make as many changes in a single 'search-replace' call as possible using multiple SEARCH/REPLACE blocks.
- Do not use both \`write_file\` and \`search_replace\` on the same file within a single response.
- Include a brief description of the changes you are making in the \`description\` parameter.

Diff format:
\`\`\`
<<<<<<< SEARCH
[exact content to find including whitespace]
=======
[new content to replace with]
>>>>>>> REPLACE
\`\`\`

Example:

Original file:
\`\`\`
def calculate_total(items):
    total = 0
    for item in items:
        total += item
    return total
\`\`\`

Search/Replace content:
\`\`\`
<<<<<<< SEARCH
def calculate_total(items):
    total = 0
    for item in items:
        total += item
    return total
=======
def calculate_total(items):
    """Calculate total with 10% markup"""
    return sum(item * 1.1 for item in items)
>>>>>>> REPLACE
\`\`\`

Search/Replace content with multiple edits:
\`\`\`
<<<<<<< SEARCH
def calculate_total(items):
    sum = 0
=======
def calculate_sum(items):
    sum = 0
>>>>>>> REPLACE

<<<<<<< SEARCH
        total += item
    return total
=======
        sum += item
    return sum
>>>>>>> REPLACE
\`\`\`


Usage: call \`search_replace\` with old_string/new_string for the first edit
and one edits[] entry per additional SEARCH/REPLACE block above.
`;
