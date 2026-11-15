# AcmeBook Lead Finder

An n8n workflow, started by hand, that finds small appointment-based businesses without online booking in 43
cities, scores them, writes an opener and saves them to the n8n Data table `acmebook_leads`. The leads are also
copied to a Google Sheet. Emails go out only for leads ticked in that sheet, and only when AcmeBook Sender is run by
hand. The Code-node logic lives in `src/*.js` and is tested with Node's built-in test runner; `build.js` inlines it
into the workflows.

To set the project up on a new PC (n8n in Docker), follow `SETUP.md`.

## Test

```bash
npm test
```

## Build

```bash
node build.js
```

Writes `build/workflow.json` (the Lead Finder), `build/tables.json` (the columns of both Data tables),
`build/cities.json` (the 43 city rows) and the three email workflows `build/sheet_sync.json`, `build/sender.json`
and `build/reply_checker.json`. `build/` is not committed.

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
2. Create the Data tables and load the cities. The way that needs no MCP is the setup script. Create an API key in
   n8n (Settings > n8n API), set it in the terminal as `N8N_API_KEY`, then run:

   ```bash
   node build.js
   node scripts/setup_n8n.js
   ```

   It creates `acmebook_leads` and `acmebook_cities` from `build/tables.json` and inserts the 43 rows of
   `build/cities.json` into `acmebook_cities`. A table that already exists is skipped, and the cities are only
   inserted into a table the script has just created. `N8N_URL` changes the address (default
   `http://localhost:5678`). `node scripts/setup_n8n.js --dry-run` only prints the planned requests and needs no
   key. With the n8n MCP instead: call `mcp__n8n__n8n_manage_datatable` with `action: createTable` for each table in
   `build/tables.json`, check with `action: listTables`, then `insertRows` with the array in `build/cities.json`.
3. Check the cities: open `acmebook_cities` in n8n and check that it has 43 rows.
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

## Email workflows

`node build.js` also writes three email workflows. Each file carries its own fixed workflow id, so an import always
replaces the same workflow.

- **AcmeBook Sheet Sync** (`build/sheet_sync.json`): copies new leads from `acmebook_leads` into the Google Sheet,
  best score first, and adds the "Send email" checkboxes to the filled rows. The Lead Finder calls it at the end of
  each run (the "Sync Sheet" node). It can also be run by hand.
- **AcmeBook Sender** (`build/sender.json`): run by hand. Sends one email per ticked row that has an email, an opener,
  Status `New` and no Sent date, at most `DAILY_SEND_LIMIT` a day, with a random pause of 1 to 3 minutes between
  emails. It writes the Sent date and Status `Sent` into the sheet and `Sent` into `acmebook_leads`. The Report node
  shows `sent` and `failed`.
- **AcmeBook Reply Checker** (`build/reply_checker.json`): when Active, checks Gmail every 15 minutes. A reply from
  a lead sets Status `Replied`, a reply asking to stop sets `Stopped`, and a bounce sets `Bounced`, in the sheet and
  in `acmebook_leads`.

## Email setup (once)

On a new PC, follow `SETUP.md`. On this PC, the values live in `src/config.js`:

| Value | What it is |
|---|---|
| `SHEET_ID` | the part of the sheet URL between `/d/` and `/edit` |
| `SHEET_TAB_GID` | the number after `#gid=` in the sheet URL (`0` for the first tab) |
| `GMAIL_CREDENTIAL` | id and name of the n8n Gmail credential (id from the URL `/credentials/<id>`) |
| `SHEETS_CREDENTIAL` | id and name of the n8n Google Sheets credential |
| `SENDER_NAME` | the name the emails are signed with |
| `POSTAL_ADDRESS` | the sender's real postal address, shown in every email footer; the Sender stops if it is empty |
| `DAILY_SEND_LIMIT` | most emails sent per day (America/New_York calendar day) |

After a change, run `node build.js` and deploy the workflows again.

## Deploy the email workflows

Build, then import each file with the same command as "Deploy a change":

```bash
node build.js
cmd //c "set N8N_USER_FOLDER=D:\Tools\n8n\data&& D:\Tools\n8n\node_modules\.bin\n8n.cmd import:workflow --input=build\sheet_sync.json"
cmd //c "set N8N_USER_FOLDER=D:\Tools\n8n\data&& D:\Tools\n8n\node_modules\.bin\n8n.cmd import:workflow --input=build\sender.json"
cmd //c "set N8N_USER_FOLDER=D:\Tools\n8n\data&& D:\Tools\n8n\node_modules\.bin\n8n.cmd import:workflow --input=build\reply_checker.json"
```

An import leaves the workflow inactive. Reload the n8n editor, then switch AcmeBook Reply Checker back to Active.

## Send emails

1. Run the Lead Finder. Its last node fills the sheet.
2. In the sheet, tick "Send email" for the leads to contact (Hot and Warm first).
3. In n8n, open AcmeBook Sender and click **Execute workflow**. It sends at most `DAILY_SEND_LIMIT` emails a day,
   1 to 3 minutes apart, so a run can take a while.
4. Check the Report node: it shows `sent` and `failed`. A failed row keeps no Sent date, so the next run tries it
   again.

To stop a lead by hand, type `Stopped` in its Status cell. Leads without an email have a Contact number for a call
or WhatsApp.

## Replies

AcmeBook Reply Checker must be Active. Switch it on before the first send: it only sees mail that arrives after it
was switched on. It checks every 15 minutes and marks the row `Replied`, `Stopped` or `Bounced`. Answer the replies
yourself in Gmail.

Do not test with an email to the sending account itself: its own email would be read as a reply. Test from another
address you can reply from. To check at once, open the Reply Checker and click **Execute workflow**: run by hand, it
reads the latest message in the inbox.
