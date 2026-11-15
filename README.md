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

`OWN_PRODUCT_DOMAINS` in `src/product.js` holds `acmebook.example`. A site on one of these domains is marked
`already_customer` in the `tool_status` column and is not a lead. Add any custom domain a AcmeBook customer uses,
then build and deploy.

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
  emails. Before each email it claims the row (Sent date and Status `Sent` in the sheet), so a lead is never emailed
  twice; a failed send sets the row back to `New`. After a send it writes `Sent` into `acmebook_leads`. The Report
  node shows `sent` and `failed`.
- **AcmeBook Reply Checker** (`build/reply_checker.json`): when Active, checks Gmail every 15 minutes. A reply from
  a lead sets Status `Replied`, a reply asking to stop sets `Stopped`, and a bounce sets `Bounced`, in the sheet and
  in `acmebook_leads`.

## Email setup (once)

On a new PC, follow `SETUP.md`. The ids of this PC live in `install.json` (a copy of `install.example.json`, never
committed):

| Value in `install.json` | What it is |
|---|---|
| `sheetId` | the part of the sheet URL between `/d/` and `/edit` |
| `sheetTabGid` | the number after `#gid=` in the sheet URL (`0` for the first tab) |
| `gmailCredential` | id and name of the n8n Gmail credential (id from the URL `/credentials/<id>`) |
| `sheetsCredential` | id and name of the n8n Google Sheets credential |

Without `install.json`, `node build.js` warns and builds with empty ids. The sender values live in `src/product.js`,
the limit in `src/config.js`:

| Value | What it is |
|---|---|
| `SENDER_NAME` (`src/product.js`) | the name the emails are signed with |
| `POSTAL_ADDRESS` (`src/product.js`) | the sender's real postal address, shown in every email footer; the Sender stops if it is empty |
| `SEND_TIMEZONE` (`src/product.js`) | the time zone whose calendar day the daily limit counts (`America/New_York`) |
| `DAILY_SEND_LIMIT` (`src/config.js`) | most emails sent per day |

After a change, run `node build.js` and deploy the workflows again.

## Deploy the email workflows

Build, then import each file with the same command as "Deploy a change":

```bash
node build.js
cmd //c "set N8N_USER_FOLDER=D:\\Tools\\n8n\\data&& D:\\Tools\\n8n\\node_modules\\.bin\\n8n.cmd import:workflow --input=build\\sheet_sync.json"
cmd //c "set N8N_USER_FOLDER=D:\\Tools\\n8n\\data&& D:\\Tools\\n8n\\node_modules\\.bin\\n8n.cmd import:workflow --input=build\\sender.json"
cmd //c "set N8N_USER_FOLDER=D:\\Tools\\n8n\\data&& D:\\Tools\\n8n\\node_modules\\.bin\\n8n.cmd import:workflow --input=build\\reply_checker.json"
```

An import leaves the workflow inactive. Reload the n8n editor, then switch AcmeBook Reply Checker back to Active.

## Send emails

1. Run the Lead Finder. Its last node fills the sheet.
2. In the sheet, tick "Send email" for the leads to contact (Hot and Warm first). A ticked row is sent only when it
   has a Lead email, an Opener, a Lead ID, Status `New` and no Sent date.
3. In n8n, open AcmeBook Sender and click **Execute workflow**. It sends at most `DAILY_SEND_LIMIT` emails a day,
   1 to 3 minutes apart, so a run can take a while.
4. Check the Report node: it shows `sent` and `failed`. A failed row is set back to Status `New` with no Sent date,
   so the next run tries it again. If no Report node runs, nothing was ready to send.

- Never start the Sender while an earlier Sender run is still running or waiting (check n8n → Executions).
- If the Sender stopped with an error, or its Report shows `failed` above 0, look in Gmail → Sent before running it again: a lead may already have the email.
- To stop a lead, change its Status to `Stopped`; never delete rows. A deleted row comes back from the leads table
  as New.
- Replies that Gmail files in Spam are not checked: look in Spam now and then.

Leads without an email have a Contact number for a call or WhatsApp.

To see at a glance which emailed leads have not replied after 7 days, add the yellow highlight in SETUP.md
step 11 ("Highlight leads with no reply yet").

## Replies

AcmeBook Reply Checker must be Active. Switch it on before the first send: it only sees mail that arrives after it
was switched on. It checks every 15 minutes and marks the row `Replied`, `Stopped` or `Bounced`. Answer the replies
yourself in Gmail.

Do not test with an email to the sending account itself: its own email would be read as a reply. Test from another
address you can reply from. To check at once, open the Reply Checker and click **Execute workflow**: run by hand, it
reads the latest message in the inbox.

## Use it for your own product

The finder looks for businesses whose website does not show your kind of product yet. So it fits any product a
business shows on its homepage: online booking, online ordering, live chat, review widgets, payments, newsletter
sign-ups. It does not fit products that leave no mark on the homepage, such as SEO, web design or accounting: the
check cannot tell who already has them.

1. Edit `src/product.js`. Every value about what you sell is there. A test checks that it exports each one and
   that no other `src` file names the example product (AcmeBook or Alex).
   - `PRODUCT_NAME`: your product's name, shown in the workflow names and the Overpass user agent.
   - `TABLE_PREFIX`: the start of the Data table names (`<prefix>_leads`, `<prefix>_cities`).
   - `CITIES`: the cities to search, with country and centre coordinates, in run order.
   - `CATEGORY_RULES`: which OpenStreetMap tags count as a lead, and the category name each gets.
   - `BARBERSHOP_CATEGORY`: the category for a `hairdresser` whose OpenStreetMap tags mention barber.
   - `COMPETITOR_TOOLS`: competing tools and the domains that show a site uses them.
   - `COMPETITOR_TEXT_MARKERS`: text in a page that shows a competitor running on the site's own domain.
   - `ACTION_WORDS`: the words in a link that point to your kind of feature (for AcmeBook: book, appointment).
   - `OWN_PRODUCT_DOMAINS`: your own domains; a site on them is already a customer.
   - `OWN_PRODUCT_TEXT_MARKER`: text in a page that shows your product is there.
   - `OWN_PRODUCT_FOOTER`: your "Powered by" footer, for customers on their own domain.
   - `POINTS`: the points for each signal in the score.
   - `REASON_TEXTS`: how the reasons in the sheet name your signal.
   - `HOT_MIN_SCORE`, `WARM_MIN_SCORE`: the lowest score for Hot and for Warm.
   - `FEEDBACK_ASK`: the question the openers end with.
   - `OPENERS`: the first line of the email for each result of the website check (`tool_status`), with
     `competitor_unnamed` used when the competitor's tool has no name. `already_customer` leads are dropped and need
     none. `{name}` and `{tool}` are filled in.
   - `SENDER_NAME`: the name the emails are signed with.
   - `POSTAL_ADDRESS`: your real postal address; the Sender refuses to run while it is empty.
   - `SEND_TIMEZONE`: the time zone whose calendar day the daily limit counts.
   - `EMAIL_SUBJECT`, `EMAIL_BODY`: the email; `{name}` (subject), `{opener}`, `{sender}` and `{address}` are filled
     in.

   In `POINTS`, `OPENERS` and `REASON_TEXTS` keep the keys and change only the values. A renamed `POINTS` key
   gives NaN scores. A missing `OPENERS` key gives an empty opener, and that lead is never emailed.
2. After the n8n credentials exist (SETUP.md step 4), copy `install.example.json` to `install.json` and fill in the
   sheet id, the tab gid and both credentials (SETUP.md step 6).
3. Run `npm test` and `node build.js`, then deploy (SETUP.md step 7, or "Deploy a change" above).
4. The law. US law (CAN-SPAM) requires a real postal address in every sales email. Other countries may forbid cold
   email to some businesses altogether: PECR in the UK, CASL in Canada and the Spam Act in Australia. It is the
   sender's job to check the law for each country before sending.

One product per n8n: the workflow ids are fixed (`WORKFLOW_IDS` in `build_outreach.js` and the Lead Finder id in
"Deploy a change"). For a second product on the same n8n, change those ids, or it replaces the first product's
workflows.

The website check is in `src/check_websites.js` and `src/detect_tool.js`. It writes `tool_status`
(`already_customer`, `competitor`, `none_found`, `no_website`, `site_down` or `site_blocked`) and `tool_name` into
the leads table. A link to the site's own action page (`action_page`) is followed, and the page it opens decides
between `competitor` and `none_found`.

## Credits and license

Business data © OpenStreetMap contributors, ODbL (`tests/fixtures/overpass_*.json` and every run).

License: MIT (see `LICENSE`).
