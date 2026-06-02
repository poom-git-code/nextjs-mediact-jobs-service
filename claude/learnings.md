# Learnings (append-only)

> Living document of mistakes the team / AI agents have made and the lessons drawn from them.
> Append entries chronologically; never edit historical entries (correct via a follow-up entry instead).
>
> The **post-mortem agent** (Phase 3) writes to this file automatically when it finds:
>   - A human reverted or rewrote AI-generated code
>   - A PR comment flagged the same issue more than once
>   - A code-review agent escalated to human and the human disagreed with the agent's verdict
>
> Humans may also add entries manually after debugging sessions.

---

## Entry template

```markdown
## YYYY-MM-DD — Short title

**Where**: PR / branch / file path
**Context**: What was being built
**Mistake**: What went wrong (concrete, not vague)
**Root cause**: Why the AI / dev made the mistake
**Correct pattern**: What should have been done (with code reference if possible)
**Action taken**: 
  - [ ] Added rule / example to `claude/forbidden-patterns.md` § N
  - [ ] Updated `CLAUDE.md` § N
  - [ ] Updated `claude/security-checklist.md` § N
  - [ ] No doc change — context-specific only
```

---

## Reading order for AI agents

When starting a feature, scan this file for entries that mention:
1. The same files / modules you're about to touch
2. The same pattern (auth, SQS consumer, ownership check, etc.)
3. The same library / API call

If you find a relevant entry, factor its lesson into your plan BEFORE implementing.

---

## Entries

<!-- ADD NEW ENTRIES BELOW THIS LINE — newest at bottom -->

(No entries yet — this file becomes valuable as the team accumulates real experience.)
