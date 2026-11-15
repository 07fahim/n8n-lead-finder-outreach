# AcmeBook Lead Finder

An n8n workflow, started by hand, that finds small appointment-based businesses without online booking in 43
cities, scores them, writes an opener and saves them to the n8n Data table `acmebook_leads`. Nothing is sent to
anyone. The Code-node logic lives in `src/*.js` and is tested with Node's built-in test runner; `build.js` inlines
it into the workflow.

## Test

```bash
npm test
```

## Build

```bash
node build.js
```

Writes `build/workflow.json` (the workflow), `build/tables.json` (the columns of both Data tables) and
`build/cities.json` (the 43 city rows). `build/` is not committed.

## First-time setup in n8n

1. Raise the Code node timeout: back up `D:\Tools\n8n\start-n8n.cmd`, add `set N8N_RUNNERS_TASK_TIMEOUT=2400` above
   the line that starts n8n, restart n8n and check that `curl -s -o /dev/null -w "%{http_code}"
   http://127.0.0.1:5678/healthz` prints `200`.
2. Create the Data tables: for each table in `build/tables.json`, call `mcp__n8n__n8n_manage_datatable` with
   `action: createTable`, the table name and its columns; check with `action: listTables`.
3. Load the cities: insert one probe row into `acmebook_cities` to check that `last_run` accepts an ISO date, delete
   it, then `insertRows` with the array in `build/cities.json` (expect 43).
4. Create the workflow: `mcp__n8n__n8n_create_workflow` with `name`, `nodes`, `connections` and `settings` from
   `build/workflow.json`, and record the returned id below.

## Deploy a change

```bash
node build.js
```

Then call `mcp__n8n__n8n_update_full_workflow` with the contents of `build/workflow.json` and the workflow id
`<workflow id: filled in at first deploy>`.

## Run

Open http://localhost:5678, open "AcmeBook Lead Finder" and click **Execute workflow**. The Run Report node shows
the counts per city; the Check Run node shows the totals for the run.

## AcmeBook domains

`ACMEBOOK_DOMAINS` in `src/config.js` holds `acmebook.example`. Add any custom domain a AcmeBook customer uses, then
build and deploy.

## Stop seeing a lead

Change the lead's `status` in `acmebook_leads`. Do not delete the row: a deleted lead is no longer known as seen and
comes back in a later run.
