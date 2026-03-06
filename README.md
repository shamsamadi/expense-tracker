# Expense Tracker

Automatically extracts structured data from receipt images using **Google Gemini 2.5 Flash** and logs the merchant, date, amount, and category into a Google Sheet — with no manual entry. The pipeline is orchestrated by **Microsoft Power Automate** and runs on a **Google Apps Script** webhook.

## How it works

1. Email a receipt photo to your inbox with the subject `Expense for {month}`
2. Power Automate detects the email and forwards the attachment to the Apps Script webhook
3. Gemini 2.5 Flash reads the receipt image and extracts the key fields
4. A new row is appended to your Google Sheet automatically

## Stack

| Tool | Role |
|------|------|
| Microsoft Power Automate | Monitors inbox and orchestrates the workflow |
| Google Apps Script | Serverless webhook that runs the pipeline |
| Google Gemini 2.5 Flash | Multimodal AI that parses receipt images |
| Google Sheets | Stores the structured expense data |

## Sheet Columns

| Column | Content |
|--------|---------|
| A | Logged At |
| B | Month |
| C | Purchase Date |
| D | Merchant |
| E | Amount ($) |
| F | Category |
| G | Receipt File |
| H | Sender |
| I | Email Received |

## Setup

See [SETUP.md](SETUP.md) for full setup instructions.
