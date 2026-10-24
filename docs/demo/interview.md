# Interview demo: passwerk as a hosted MCP server

About six minutes. The story: a battery supplier hands over a folder of messy documents and gets a
validated EU battery passport back, with the slow work running on a server as an MCP task.

This follows phase 9a: [docs/plans/hosted-tasks.md](../plans/hosted-tasks.md) and ADRs D-047 to
D-050. Machine setup is in [docs/install/instabox-demo.md](../install/instabox-demo.md).

## The day before

- [ ] `claude --version` is 2.1.304 or later, and `claude` is signed in with a claude.ai account
      (tasks need that, not an API key or Bedrock).
- [ ] `claude mcp list` in `W:\personal-code\passwerk` shows `passwerk-demo` as connected.
- [ ] The InstaBox container runs `main`. Section "Update the code" of the install guide, then
      `sudo docker logs --tail 1 passwerk-hosted` ends with `AI reading on`.
- [ ] Record one good run of part 2 as the fallback (Windows: Win+Alt+R in the terminal window).
      Keep the file on the desktop.
- [ ] Two clean runs of the whole script in a row (see "Rehearsal log" below).

## 15 minutes before

The free plan pauses the machine after 30 idle minutes and after 8 running hours, and a paused
machine does not wake on a request (it answers 503).

1. Open https://dashboard.instabox.sh/dashboard/machines. If `passwerk-demo` shows Paused or
   Stopped, press its start button and wait for Running.
2. Warm it up in a fresh terminal:
   ```
   cd W:\personal-code\passwerk
   claude
   ```
   Ask: `Run passwerk-demo's slow_echo with "warm" for 3 seconds.` It should answer `warm`.
3. Empty a folder for the downloads: `mkdir W:\demo-out`. Start the demo session there, or tell
   Claude where to save.
4. Close everything else. Terminal font large. `/tasks` closed.

## Part 1: the problem and the local product (1 minute, optional)

Claude desktop app, local passwerk (stdio, no network).

- Say: from February 2027 every EV, LMT and industrial battery over 2 kWh needs a digital passport
  (Regulation (EU) 2023/1542, Art. 77). The supplier who has the data in PDFs and spreadsheets has
  no tool for it.
- In a new chat, prompt: `Open the passwerk workbench with review_passport and load the Musterwerk
  sample documents.` The workbench opens inside the chat. Show the gaps view and the QR carrier.
  Do not edit anything.
- A vaguer prompt such as `Review the Musterwerk passport.` can make Claude run the pipeline in the
  chat and never open the workbench. If that happens, say `Open it in the workbench.`
- Bridge: this all runs on my laptop. Now the same engine on a server, for jobs that take minutes.

Skip part 1 if time is short; part 2 stands alone.

## Part 2: the hosted server in Claude Code (4 minutes)

Terminal, `claude` started in `W:\demo-out` (or in the repo).

### 2a. A series as one background task (1 minute)

Prompt:

```
Use passwerk-demo to run the musterwerk-60 series, category EV, with confirm set to hold.
```

- The footer shows `1 MCP task`. Open `/tasks`: the line moves, `Model 23 of 60 · 198 facts · …`.
- Say: the call returned at once with a task id; the server parses PDFs in a worker thread and
  Claude Code polls `tasks/get`. The chat stays free. Ask something unrelated while it runs if you
  like.
- Close `/tasks`. When it finishes, Claude summarises: 60 models, verdicts, completeness. Do not
  wait for it if time is short; go on to 2b.

`hold` matters here: with `ask`, the series would end in up to 16 questions. With AI reading on,
each model costs about one to two cents of Jev calls, so one 60-model run is roughly one euro.
Time the run in rehearsal and write it in the log.

### 2b. My own documents, held values, a clean passport (2 minutes)

Prompt:

```
Make a battery passport from the five files in W:\personal-code\passwerk\demo\series\musterwerk-complete with passwerk-demo, category EV. Upload them, then download the passport files here.
```

What happens, and what to say:

1. Claude calls `create_upload` and sends the files with `curl -X PUT`. Say: the bytes go
   straight from disk to the server through a one-time link; they never pass through the model,
   and the server token stays hidden.
2. `run_series` starts as a task. After a few seconds the dialogs appear, one per value the AI
   reading found but did not apply on its own (about 11). Each shows the value, the document and
   page it came from, and the confidence. Say: the reading is Jev, a small model that only picks
   among candidates passwerk extracted. It never invents a value; code copies every value from the
   documents. Anything it is not sure of comes to a person.
3. Apply all of them. If one is tempting to skip, skip the part numbers to show that a skipped
   value stays open.
4. The result: `valid`, mandatory completeness 100 % (or 97.9 % with the part numbers skipped).
   Say: valid means the file passes the official IDTA template and our plausibility rules;
   completeness is how much of what the regulation requires is filled in. Two separate numbers on
   purpose.
5. Claude runs the `curl` download line. Open the zip, then `musterwerk-complete.html` in the
   browser: the passport sheet, every value with its source.

If the dialogs do not show: `/tasks` is probably open. Close it.

### 2c. Survives a restart (1 minute, optional)

Run 2b again, and while the first dialog is open:

1. Quit Claude Code (Ctrl+C twice).
2. `claude --resume`, pick the session.
3. The dialog comes back; answer it and the result arrives.

Say: the task lives on the server, not in the terminal. A laptop can close; the job does not stop.

## Part 3: talk track (1 minute, or as questions come)

- **Why tasks.** A passport run is seconds to minutes; a series is many of those. MCP tasks let the
  server answer a tool call at once and the client poll, ask questions mid-run
  (`input_required`), and cancel. Without them the call times out after 60 seconds.
- **Why SDK v2 and revision 2026-07-28.** Stateless HTTP: any instance can answer any request,
  so it scales behind a load balancer. Tasks are an official extension.
- **Trust.** The verdict comes only from the validators, never from a model. The core library and
  the local server make no network and no model calls; CI proves it with a `--network none` run.
  AI reading is optional and server-side; on-premise customers keep it off.
- **Security in the demo.** Bearer token for MCP, one-time capability links for upload and
  download, memory only, nothing written to disk, read-only container.
- **How it grows (phase 9b).** EU hosting (Hetzner), OAuth per customer, a Postgres task store and a
  worker queue instead of memory, so tasks survive a server restart.

## If something breaks

| Symptom | Do this |
|---|---|
| 503 "Sandbox offline" | The machine paused. Start it in the dashboard, wait 30 s, retry. |
| 502 | The proxy gave up after about 20 s without a first byte. Retry once; if it repeats, play the recording. |
| No `1 MCP task` in the footer | Claude Code too old, signed in with an API key, or the call came from a subagent. Play the recording. |
| No dialogs | `/tasks` is open. Close it. In `claude -p` there are never dialogs. |
| The download says 404 | The link was used or is older than 15 minutes. Run again. |
| Anything else for more than a minute | Play the recording and keep talking. |

## After the interview

Follow "After the interview" in the install guide: unpublish port 8080 and rotate the token.

## Rehearsal log

| Run | Date | Part 2a | Part 2b | Part 2c | Notes |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
