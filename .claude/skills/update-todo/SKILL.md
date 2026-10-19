---
name: update-todo
description: Keep docs/TODO.md (the project's single list of open work) current. Use at the end of every task, when a job is finished, started, blocked or newly discovered, and whenever someone asks "what's left / what's next".
---

# Keep the to-do list current

`docs/TODO.md` is the one list of open work for the owner, developers and Claude. Update it in the **same change**
as the work (same commit or pull request), never "later".

1. Read `docs/TODO.md` first.
2. Finished something on the list → move it to **Done** as `- YYYY-MM-DD what changed` (one line, plain words).
3. Started it → move it to **Now**. Blocked → move it to the group it waits on (owner, client) and say on what.
4. Found new work you didn't do (a bug, a missing feature, a follow-up) → add it to the right group, one line,
   with the file or doc that explains it.
5. Remove Done lines older than 30 days. Update "Last updated".
6. Client decisions also go to `docs/product/OPEN_QUESTIONS.md`; launch items stay in sync with `docs/guides/LAUNCH.md`.
7. When asked "what's next?", answer from this file: the top of **Now**, then **Next**.

Keep lines short and specific: what, where, and who it waits on. No duplicates of items already listed.
