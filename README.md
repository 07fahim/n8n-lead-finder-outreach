# n8n Lead Finder & Outreach

Four n8n workflows that find local businesses that could use your product, score them, put them in a Google Sheet,
and email the ones you tick from Gmail. Replies, opt-outs and bounces are marked in the sheet automatically.

It ships with a made-up example product, **AcmeBook** (online booking for salons, clinics and studios). Change one
file, `src/product.js`, to use it for your own product.

## How it works

| Workflow | Starts | What it does |
|---|---|---|
| Lead Finder | by hand | Takes the next 4 cities, finds businesses of your categories on OpenStreetMap, checks each website for your product or a competitor's, scores the lead, writes a first line for the email and saves it to the n8n Data table `<prefix>_leads` (at most 200 per run). Then it calls Sheet Sync |
| Sheet Sync | called by the finder, or by hand | Adds new leads to the Google Sheet, best score first, with a "Send email" checkbox |
| Sender | by hand | Emails the ticked rows from Gmail as plain text: at most `DAILY_SEND_LIMIT` a day, 1–3 minutes apart. A row is claimed before its email goes out, so nobody is emailed twice |
| Reply Checker | active, every 15 min | Marks a row `Replied`, `Stopped` (they asked to stop) or `Bounced`. It never answers anyone |

Nothing is emailed unless you tick the row and run the Sender yourself.

The logic lives in plain JavaScript in `src/`, tested with Node's built-in test runner. `node build.js` inlines it
into the n8n workflow files in `build/`.

### What fits

The check looks at each business's homepage. So the project fits products a business shows there: online booking,
online ordering, live chat, review widgets, payments, newsletter sign-ups. It does not fit products that leave no
mark on the homepage (SEO, web design, accounting): the check cannot tell who already has them.

## Requirements

- n8n 2.x, self-hosted (Docker or npm), with Data tables.
- Node.js 20 or later on the machine where you build.
- A Google account for sending (a new Gmail is fine), and a Google Cloud project for its OAuth client.

## Setup

1. **n8n settings.** Start n8n with these environment variables:

   ```
   NODE_FUNCTION_ALLOW_BUILTIN=url
   N8N_RUNNERS_TASK_TIMEOUT=2400
   ```

   The Code node sandbox has no global `URL`, so every Code node starts with `const { URL } = require('url');`. The
   timeout covers the long OpenStreetMap queries and website checks.
2. **Tests and build.**

   ```bash
   npm test
   node build.js
   ```

   At this point `node build.js` prints a line saying there is no `install.json`. That is expected: it is filled in
   at step 6.
3. **Data tables.** Create an API key in n8n (Settings → n8n API) and run:

   ```bash
   N8N_API_KEY=<your key> node scripts/setup_n8n.js
   ```

   It creates `<prefix>_leads` and `<prefix>_cities` and loads the cities. `N8N_URL` changes the address (default
   `http://localhost:5678`); `--dry-run` only prints the requests.
4. **Google sign-in.** In Google Cloud Console: enable the Gmail API and the Google Sheets API, set up the OAuth
   consent screen (External) with the sending Gmail as a test user (press Enter so it becomes a chip), and create an
   OAuth client (Web application) with the redirect URL that n8n shows. In n8n, create a Gmail OAuth2 credential and a
   Google Sheets OAuth2 credential with that client and sign in.
5. **The sheet.** Create a Google Sheet with an empty tab named `Leads`. Sheet Sync writes the header row and adds a
   checkbox to every filled row.
6. **Your ids.** Copy `install.example.json` to `install.json` (it is never committed) and fill it in:

   | Value | Where to find it |
   |---|---|
   | `sheetId` | the part of the sheet URL between `/d/` and `/edit` |
   | `sheetTabGid` | the number after `#gid=` in the sheet URL (`0` for the first tab) |
   | `gmailCredential` | id and name of the n8n Gmail credential (id from the URL `/credentials/<id>`) |
   | `sheetsCredential` | id and name of the n8n Google Sheets credential |

   Then set `SENDER_NAME`, `POSTAL_ADDRESS` (your real postal address; the Sender refuses to run while it is
   empty) and `SEND_TIMEZONE` in `src/product.js`, and run `node build.js` again.
7. **Import.** Import each file in `build/` with n8n's own command:

   ```bash
   n8n import:workflow --input=build/workflow.json
   n8n import:workflow --input=build/sheet_sync.json
   n8n import:workflow --input=build/sender.json
   n8n import:workflow --input=build/reply_checker.json
   ```

   With Docker, copy the files into the container and run the same command with `docker exec <container> ...`. The
   email workflows carry fixed ids, so a later import replaces them. The Lead Finder gets its id on the first
   import; for later imports, put that id into the file first (`w.id = '<id>'`) so the import replaces it too.
   An import leaves a workflow inactive: switch the Reply Checker to Active afterwards.

Import the workflow files as built. Do not paste them through an AI tool or by hand: a hand-copied workflow once
changed code silently.

## Daily use

1. Run **Lead Finder**. Its last node fills the sheet.
2. In the sheet, tick "Send email" for the leads to contact (Hot and Warm first). A ticked row is sent only when it
   has a Lead email, an Opener, a Lead ID, Status `New` and no Sent date.
3. Run **Sender**. Its Report node shows `sent` and `failed`. A failed row goes back to `New` and is tried again on
   the next run. If no Report node runs, nothing was ready to send.
4. Answer replies yourself in Gmail. The Reply Checker only marks them.

What the Status column means:

| Status | Meaning |
|---|---|
| `New` | not emailed yet |
| `Sent` | emailed, no answer yet (most leads stay here) |
| `Replied` | answered; read it in Gmail |
| `Stopped` | asked not to be emailed again; they never are |
| `Bounced` | the address does not exist |

- Never start the Sender while an earlier Sender run is still running or waiting (n8n → Executions).
- If the Sender stopped with an error, look in Gmail → Sent before running it again.
- To stop a lead, change its Status to `Stopped`. Never delete rows: a deleted row comes back from the leads table.
- Replies that Gmail files in Spam are not checked: look in Spam now and then.
- Leads without an email have a Contact number for a call or WhatsApp.
- A new Gmail account lands in Spam at first. Warm it up, set its display name to the sender name, and start at
  5–10 emails a day.

**Highlight leads with no reply yet.** In the sheet, type `A2:K1000` in the Name box, then Format → Conditional
formatting → "Custom formula is":

```
=AND($J2="Sent",$I2<>"",DATEVALUE($I2)<=TODAY()-7)
```

Pick a light fill and click Done. Rows emailed 7 or more days ago with no answer turn that colour, and lose it when
the lead replies. If Sheets refuses the formula, your locale uses `;` instead of `,`.

## Use it for your own product

1. Edit `src/product.js`. Every value about what you sell is there:
   - `PRODUCT_NAME`: shown in the workflow names and the OpenStreetMap user agent.
   - `TABLE_PREFIX`: the start of the Data table names.
   - `CITIES`: the cities to search, with country and centre coordinates, in run order.
   - `CATEGORY_RULES`: which OpenStreetMap tags count as a lead, and the category each gets.
   - `COMPETITOR_TOOLS`, `COMPETITOR_TEXT_MARKERS`: competing tools and how to recognise them on a page.
   - `ACTION_WORDS`: the words in a link that point to your kind of feature (for AcmeBook: book, appointment).
   - `OWN_PRODUCT_DOMAINS`, `OWN_PRODUCT_TEXT_MARKER`, `OWN_PRODUCT_FOOTER`: how to recognise an existing customer,
     who is then left out.
   - `POINTS`, `HOT_MIN_SCORE`, `WARM_MIN_SCORE`, `REASON_TEXTS`: the score and how its reasons read.
   - `FEEDBACK_ASK`, `OPENERS`: the first line of each email, by the result of the website check.
   - `SENDER_NAME`, `POSTAL_ADDRESS`, `SEND_TIMEZONE`, `EMAIL_SUBJECT`, `EMAIL_BODY`: the email itself.

   In `POINTS`, `OPENERS` and `REASON_TEXTS`, keep the keys and change only the values. A renamed `POINTS` key gives
   NaN scores; a missing `OPENERS` key gives an empty first line, and that lead is never emailed.
2. Run `npm test` and `node build.js`, then import again.

One product per n8n: the workflow ids are fixed (`WORKFLOW_IDS` in `build_outreach.js`). For a second product on the
same n8n, change them first, or the import replaces the first product's workflows.

## The law

US law (CAN-SPAM) requires a real postal address in every sales email, and a way to opt out (the footer asks people
to reply "stop"). Other countries may forbid cold email to some businesses altogether: PECR in the UK, CASL in
Canada, the Spam Act in Australia. Check the law for each country before you send.

## Project layout

- `src/product.js`: everything about what you sell. `src/config.js`: engine settings (limits, timeouts, columns).
- Lead finder: `pick_cities.js`, `query_overpass.js`, `normalize_businesses.js`, `read_contacts.js`,
  `check_websites.js`, `detect_tool.js`, `score_lead.js`, `report_run.js`.
- Email: `sheet_rows.js`, `pick_rows_to_send.js`, `build_email.js`, `classify_reply.js`.
- Build: `build.js`, `build_outreach.js`, `build_nodes.js`, `install.js`.
- `scripts/setup_n8n.js` (Data tables), `scripts/export_leads.py` (Excel export of the leads table).
- `tests/`: one test file per source file.

## Credits and license

Business data © OpenStreetMap contributors, ODbL (`tests/fixtures/overpass_*.json` and every run).

License: MIT (see `LICENSE`).
