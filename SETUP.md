# Expense Tracker — Setup Guide

**How it works:**
1. You email `shamim@innovid.com` with subject `Expense for {month}` and a receipt attached.
2. Power Automate detects the email and sends the attachment to a Google Apps Script webhook.
3. The webhook calls Gemini to extract date, merchant, amount, and category from the receipt.
4. A new row is appended to your Google Sheet automatically.

---

## Step 1 — Get a Gemini API Key (~2 min)

1. Go to [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Click **Create API key** → **Create API key in new project**
3. Copy the key and save it somewhere temporarily.

> **Important:** Enable billing on the Google Cloud project associated with your API key.
> Without billing, the free tier quota is exhausted quickly during testing.
> At normal usage (a few receipts per month) the cost is essentially zero.
> To enable billing: go to [console.cloud.google.com](https://console.cloud.google.com) →
> **Billing** → link a billing account to your project.

---

## Step 2 — Create your Google Sheet (~2 min)

1. Go to [https://sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet.
2. Name it **Expense Tracker** (or anything you like).
3. Copy the **Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/  <<<THIS PART>>>  /edit
   ```
4. Save the ID somewhere temporarily.

---

## Step 3 — Deploy the Apps Script Webhook (~10 min)

### 3a. Create the project

1. Go to [https://script.google.com](https://script.google.com)
2. Click **New project**
3. Name it **Expense Tracker Webhook**
4. Delete all the default code in the editor.
5. Copy the entire contents of `Code.gs` (from this repo) and paste it into the editor.
6. Click **Save** (Ctrl+S / Cmd+S).

### 3b. Add Script Properties

1. In the Apps Script editor, click **Project Settings** (gear icon, left sidebar).
2. Scroll down to **Script Properties** and click **Add script property** twice:

   | Property          | Value                          |
   |-------------------|--------------------------------|
   | `GEMINI_API_KEY`  | Your key from Step 1           |
   | `SPREADSHEET_ID`  | Your sheet ID from Step 2      |

3. Click **Save script properties**.

### 3c. Deploy as a Web App

1. In the Apps Script editor, click **Deploy** → **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Fill in the settings:
   - **Description:** Expense Tracker Webhook
   - **Execute as:** Me
   - **Who has access:** Anyone  ← *This is required so Power Automate can call it*
4. Click **Deploy**.
5. Authorize the requested permissions when prompted (this allows the script to access your Gmail/Drive/Sheets).
6. **Copy the Web App URL** — you'll need it in Step 4. It looks like:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

> **Important — Redeploying after code changes:**
> Any time you update `Code.gs`, you must redeploy for changes to take effect.
> Go to **Deploy → Manage deployments** → click the pencil icon → set Version to
> **"New version"** → click **Deploy**. The URL stays the same.
>
> Also verify that the URL in your Power Automate HTTP action matches the URL shown
> in **Manage deployments**. A mismatch means Power Automate is calling an old or
> different project and your changes will have no effect.

### 3d. Verify the webhook is live

Paste your Web App URL in a browser. You should see:
```json
{"status": "Expense Tracker webhook is live ✓"}
```

---

## Step 4 — Create the Power Automate Flow (~15 min)

1. Go to [https://make.powerautomate.com](https://make.powerautomate.com) and sign in with your Microsoft account.
2. Click **Create** → **Automated cloud flow**.
3. Name it **Expense Email Tracker**, then search for and select:
   **"When a new email arrives (V3)"** (Office 365 Outlook connector)
4. Click **Create**.

### 4a. Configure the Trigger

In the trigger settings, set:
- **Folder:** Inbox
- **Subject Filter:** `Expense for`
- **Include Attachments:** Yes
- **Only with Attachments:** No *(allows emails without receipts to still be logged)*

### 4b. Add an "Apply to each" loop

1. Click **+ New step** → search for and select **Apply to each**.
2. In the **Select an output from previous steps** field, click in the box and then click **Enter custom value (fx)**.
3. Enter the expression:
   ```
   triggerBody()?['attachments']
   ```
4. Click **OK**.

### 4c. Add a "Build Body" Compose action inside the loop

1. Inside the "Apply to each" block, click **Add an action**.
2. Search for **Compose** and select it.
3. Rename it to `Build Body` (click the three dots → Rename).
4. In the **Inputs** field, click **Enter custom value (fx)** and paste:
   ```json
   {
     "month": "@{trim(last(split(triggerBody()?['subject'], 'Expense for ')))}",
     "emailReceivedAt": "@{triggerBody()?['receivedDateTime']}",
     "senderEmail": "@{triggerBody()?['from']}",
     "attachmentName": "@{items('Apply_to_each')?['name']}",
     "attachmentContentType": "@{items('Apply_to_each')?['contentType']}",
     "attachmentBase64": "@{items('Apply_to_each')?['contentBytes']}"
   }
   ```

   > **Note:** If the loop step was auto-named something other than `Apply_to_each`,
   > rename it to `Apply_to_each` (click the three dots → Rename) or update the
   > expression to match the actual step name.

### 4d. Add an HTTP action inside the loop

1. After the Compose action, click **Add an action**.
2. Search for **HTTP** and select the **HTTP** action (not "HTTP with Azure AD").
3. Configure it:

   | Field          | Value                                              |
   |----------------|----------------------------------------------------|
   | **Method**     | POST                                               |
   | **URI**        | *(paste your Web App URL from Step 3c)*            |
   | **Headers**    | Key: `Content-Type`  Value: `application/json`     |
   | **Body**       | `@outputs('Build_Body')`                           |

4. Click the **Settings** tab on the HTTP action and turn **Asynchronous pattern** to **Off**.

5. Click **Save** (top right).

> **Note on the 302 redirect:** Google Apps Script web apps always respond to POST
> requests with a 302 redirect. This causes Power Automate to mark the HTTP action
> as failed, but the script still runs and writes to the sheet successfully.
> You can safely ignore this failure status.

---

## Step 5 — Test it (~3 min)

1. Send an email to `shamim@innovid.com` with:
   - **Subject:** `Expense for January 2025`
   - **Attachment:** A photo or PDF of any receipt
2. Wait up to 2 minutes for Power Automate to pick it up.
3. Open your Google Sheet — a new row should appear with the date, merchant, amount, and category filled in.

### Checking for errors

- **Power Automate:** Go to **My flows** → click the flow → **Run history** to see run details.
- **Apps Script:** Open the Apps Script project → **Executions** (left sidebar) to see run history.

---

## Google Sheet Columns

| Column | Content           |
|--------|-------------------|
| A      | Logged At         |
| B      | Month             |
| C      | Purchase Date     |
| D      | Merchant          |
| E      | Amount ($)        |
| F      | Category          |
| G      | Receipt File name |
| H      | Sender email      |
| I      | Email Received    |

---

## Expense categories

Gemini will classify each receipt into one of:
`Meals`, `Travel`, `Accommodation`, `Supplies`, `Software`, `Entertainment`, `Other`

---

## Email subject format

The subject must contain the text **`Expense for `** (case-sensitive, with a trailing space).
Everything after it becomes the **Month** column. Examples:

- `Expense for January 2025` → Month: `January 2025`
- `Expense for Q1 2025` → Month: `Q1 2025`
- `Expense for March` → Month: `March`

---

## Troubleshooting

**Gemini fields (merchant, date, amount, category) are empty:**
- Verify `GEMINI_API_KEY` is set correctly in Script Properties.
- Verify billing is enabled on the Google Cloud project for the API key.
- Make sure you redeployed after any code changes (see Step 3c note).
- Make sure the URL in Power Automate matches the URL in Manage deployments.

**Data is writing to the wrong spreadsheet:**
- Double-check that `SPREADSHEET_ID` in Script Properties matches the ID in the URL
  of the sheet you're checking.

**Power Automate flow shows as failed but data appears in the sheet:**
- This is expected due to the 302 redirect from Google Apps Script (see Step 4d note).

**Power Automate flow shows as failed and no data in the sheet:**
- Check Apps Script → Executions to see if `doPost` ran.
- If no executions appear, the webhook URL in Power Automate may be incorrect.
- Verify the URL ends with `/exec` (not `/dev`).
