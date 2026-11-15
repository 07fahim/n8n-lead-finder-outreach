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

1. Set up the Code node runner: back up `D:\Tools\n8n\start-n8n.cmd` and make sure these two lines stand above
   the line that starts n8n:

   ```bat
   set N8N_RUNNERS_TASK_TIMEOUT=2400
   set NODE_FUNCTION_ALLOW_BUILTIN=crypto,url
   ```

   The timeout covers the long Overpass queries and website checks. The `url` module is needed because the Code
   node sandbox has no global `URL`, and every Code node starts with `const { URL } = require('url');`. Keep
   `crypto` in the list: other workflows on this machine already use it. Restart n8n and check that
   `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5678/healthz` prints `200`.
2. Create the Data tables: for each table in `build/tables.json`, call `mcp__n8n__n8n_manage_datatable` with
   `action: createTable`, the table name and its columns; check with `action: listTables`.
3. Load the cities: insert one probe row into `acmebook_cities` to check that `last_run` accepts an ISO date, delete
   it, then `insertRows` with the array in `build/cities.json` (expect 43).
4. Create the workflow with n8n's own import command (see the warning under "Deploy a change"). Build the import
   file without an `id`, so the first import creates a new workflow:

   ```bash
   node build.js
   node -e "const w=require('./build/workflow.json'); delete w.id; w.active=false;
   require('fs').writeFileSync('build/workflow-import.json', JSON.stringify(w));"
   cmd //c "set N8N_USER_FOLDER=D:\\Tools\\n8n\\data&& D:\\Tools\\n8n\\node_modules\\.bin\\n8n.cmd import:workflow --input=build\\workflow-import.json"
   ```

   Reload the n8n editor, open "AcmeBook Lead Finder" and read the new id from the editor URL
   (`/workflow/<id>`). Write that id into the "Deploy a change" section below in place of the current one.

## Deploy a change

```bash
node build.js
```

Then import the file with n8n's own command, so the code reaches n8n exactly as built (the workflow id is
`AcmeBookFinder01`; the import replaces that workflow and leaves it inactive):

```bash
node -e "const w=require('./build/workflow.json'); w.id='AcmeBookFinder01'; w.active=false;
require('fs').writeFileSync('build/workflow-import.json', JSON.stringify(w));"
cmd //c "set N8N_USER_FOLDER=D:\\Tools\\n8n\\data&& D:\\Tools\\n8n\\node_modules\\.bin\\n8n.cmd import:workflow --input=build\\workflow-import.json"
```

Do not paste the workflow through an AI tool call: a hand-copied 115 kB of code changed a comment on the first
deploy (2026-11-16). Reload the n8n editor tab after importing.

## Run

Open http://localhost:5678, open "AcmeBook Lead Finder" and click **Execute workflow**. The Run Report node shows
the counts per city; the Check Run node shows the totals for the run.

## AcmeBook domains

`ACMEBOOK_DOMAINS` in `src/config.js` holds `acmebook.example`. Add any custom domain a AcmeBook customer uses, then
build and deploy.

## Stop seeing a lead

Change the lead's `status` in `acmebook_leads`. Do not delete the row: a deleted lead is no longer known as seen and
comes back in a later run.
