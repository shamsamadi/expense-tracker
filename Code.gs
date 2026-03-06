// ─────────────────────────────────────────────────────────────────────────────
// Expense Tracker — Google Apps Script Webhook
//
// Receives POST requests from Power Automate, parses receipt attachments
// with Gemini, and logs each expense to a Google Sheet.
//
// Required Script Properties (Project Settings → Script Properties):
//   GEMINI_API_KEY   — your Google AI Studio API key
//   SPREADSHEET_ID   — the ID from your Google Sheet URL
// ─────────────────────────────────────────────────────────────────────────────

const SHEET_NAME  = 'Expenses';
const GEMINI_URL  = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const CATEGORIES  = ['Meals', 'Travel', 'Accommodation', 'Supplies', 'Software', 'Entertainment', 'Other'];

// ── Entry points ──────────────────────────────────────────────────────────────

/** Health check — lets you confirm the web app is live. */
function doGet() {
  return json({ status: 'Expense Tracker webhook is live ✓' });
}

/**
 * Main webhook handler.
 * Power Automate posts JSON with these fields:
 *   month                 — extracted from email subject ("January 2025")
 *   emailReceivedAt       — ISO datetime string
 *   senderEmail           — sender address
 *   attachmentName        — original filename
 *   attachmentContentType — MIME type (image/jpeg, application/pdf, …)
 *   attachmentBase64      — base64-encoded file content
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    const month            = (data.month            || '').trim();
    const emailReceivedAt  = data.emailReceivedAt   || '';
    const senderEmail      = data.senderEmail       || '';
    const attachmentName   = data.attachmentName    || '';
    const contentType      = data.attachmentContentType || '';
    const base64           = data.attachmentBase64  || '';

    // Parse the receipt if an attachment was provided
    let receiptData = {};
    if (base64 && contentType) {
      receiptData = parseReceiptWithGemini(base64, contentType);
    }

    logToSheet(month, receiptData, attachmentName, senderEmail, emailReceivedAt);

    return json({ success: true, month, merchant: receiptData.merchant || '' });

  } catch (err) {
    console.error('doPost error:', err.message);
    return json({ success: false, error: err.message });
  }
}

// ── Gemini receipt parser ─────────────────────────────────────────────────────

function parseReceiptWithGemini(base64, mimeType) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not set in Script Properties.');

  const prompt =
    'You are a receipt parser. Extract the following fields from this receipt ' +
    'and return ONLY a valid JSON object with no markdown or extra text:\n' +
    '{\n' +
    '  "date": "purchase date as YYYY-MM-DD, or empty string if not found",\n' +
    '  "merchant": "store or vendor name, or empty string if not found",\n' +
    '  "amount": <total as a number with no currency symbol, or null if not found>,\n' +
    '  "category": "one of: ' + CATEGORIES.join(', ') + '"\n' +
    '}';

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64 } }
      ]
    }],
    generationConfig: { temperature: 0.1 }
  };

  const response = UrlFetchApp.fetch(
    `${GEMINI_URL}?key=${apiKey}`,
    {
      method:            'POST',
      contentType:       'application/json',
      payload:           JSON.stringify(payload),
      muteHttpExceptions: true
    }
  );

  if (response.getResponseCode() !== 200) {
    console.error('Gemini API error:', response.getContentText());
    return {};
  }

  const result  = JSON.parse(response.getContentText());
  const parts   = result?.candidates?.[0]?.content?.parts ?? [];
  const rawText = (parts.find(p => !p.thought) ?? parts[0])?.text ?? '';

  // Strip markdown code fences if Gemini wrapped the JSON
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('Could not find JSON in Gemini response:', rawText);
    return {};
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('JSON parse failed:', err.message, rawText);
    return {};
  }
}

// ── Google Sheets writer ──────────────────────────────────────────────────────

function logToSheet(month, receipt, attachmentName, senderEmail, emailReceivedAt) {
  const sheet = getOrCreateSheet();

  sheet.appendRow([
    new Date(),                                      // A  Logged At
    month,                                           // B  Month
    receipt.date     || '',                          // C  Purchase Date
    receipt.merchant || '',                          // D  Merchant
    receipt.amount   != null ? receipt.amount : '',  // E  Amount ($)
    receipt.category || '',                          // F  Category
    attachmentName,                                  // G  Receipt File
    senderEmail,                                     // H  Sender
    emailReceivedAt                                  // I  Email Received
  ]);
}

function getOrCreateSheet() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID not set in Script Properties.');

  const ss    = SpreadsheetApp.openById(id);
  let   sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    setupHeaders(sheet);
  }

  return sheet;
}

function setupHeaders(sheet) {
  const headers = [
    'Logged At', 'Month', 'Purchase Date', 'Merchant',
    'Amount ($)', 'Category', 'Receipt File', 'Sender', 'Email Received'
  ];

  sheet.appendRow(headers);

  // Style the header row
  const range = sheet.getRange(1, 1, 1, headers.length);
  range.setFontWeight('bold')
       .setBackground('#1a73e8')
       .setFontColor('#ffffff')
       .setHorizontalAlignment('center');

  sheet.setFrozenRows(1);

  // Column widths
  const widths = [160, 110, 120, 200, 100, 130, 200, 200, 160];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
}

// ── Utility ───────────────────────────────────────────────────────────────────

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
