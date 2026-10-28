# n8n-nodes-paperoffice

n8n community nodes for [PaperOffice AI](https://paperoffice.ai/en/): archive documents, extract invoice data, redact PDFs, search your document archive and send documents to a human reviewer, from any n8n workflow.

- [Installation](#installation)
- [Credentials](#credentials)
- [Operations](#operations)
- [Trigger](#trigger)
- [Billing](#billing)
- [Limitations](#limitations)
- [Compatibility](#compatibility)
- [Resources](#resources)

## Installation

In n8n, open **Settings → Community Nodes → Install**, enter `@paperoffice-ai/n8n-nodes-paperoffice` and confirm. See the [n8n guide for community nodes](https://docs.n8n.io/integrations/community-nodes/installation/).

## Credentials

1. In PaperOffice AI, open **Account → API** ([app.paperoffice.ai/en/paperoffice-account/api](https://app.paperoffice.ai/en/paperoffice-account/api)) and create a **User token** (`po_ut_…`). A Group token (`po_gt_…`) or Secret key (`po_sk_…`) works as well. Publishable keys (`po_pk_…`) do not work.
2. In n8n, create a **PaperOffice AI API** credential and paste the token. n8n tests the key when you save it.

The key is sent only to `https://api.paperoffice.ai`. Download links that point to another host are refused.

## Operations

### Document
| Operation | What it does |
|---|---|
| Upload | Stores a binary file in a workspace. Optional AI-DMS analysis after upload. |
| Upload From URL | Stores a file from a public HTTPS URL. |
| Get | Returns the details of a document. |
| Get Text | Returns the OCR text of a document or of one page. |
| Download | Returns the stored file as binary data. |
| Search | Full-text, hybrid or semantic search in a workspace. |
| Add Tag | Adds a tag to a document. |
| Check Duplicates | Finds documents that may be duplicates. |

### Document AI
| Operation | What it does |
|---|---|
| Extract Data | Reads structured data from a stored document or a binary file. **Invoice** returns invoice number, dates, supplier, VAT ID, net, VAT and total amounts, currency, IBAN, BIC, payment terms and line items. Purchase order, delivery note, receipt or a custom profile (for example `invoice:de:DE`) return all fields found. |
| Redact PDF | Blacks out or pseudonymizes personal data. Returns the redacted PDF as binary data, named `<file>_redacted.pdf`. Pseudonymize needs the Ultra model. |
| Get Job | Returns the status and result of a job that was started without waiting. |

Extract Data and Redact PDF wait for the result by default (up to 5 minutes, adjustable). Most results arrive in the first answer. For long jobs the node checks the status at growing intervals. If you switch **Wait for Result** off, the node returns the job ID and you can use **Get Job** later.

### Human Review
| Operation | What it does |
|---|---|
| Queue Document | Sends a document to a human review (HITL) agent. Reviewers, review fields and the four-eyes rule are set in the agent in PaperOffice AI. |
| Get Many Agents | Lists your review agents. |

The reviewers' decision is sent by PaperOffice AI as a signed webhook. Ready-made workflows that verify the signature and act on the decision are in [paperoffice-ai/n8n-workflows](https://github.com/paperoffice-ai/n8n-workflows).

### Workspace
| Operation | What it does |
|---|---|
| Get Many | Lists your workspaces. |

## Trigger

**PaperOffice AI Trigger** starts a workflow when a new document arrives in a workspace (polling). The first poll after activation only remembers the newest document; later polls return the documents added since then, oldest first.

## Billing

No specific plan is required. Usage is billed to your PaperOffice AI account as usual.

## Limitations

- Files are uploaded in one request; very large files may hit the upload limit of your plan.
- Search finds documents uploaded seconds before only after indexing.
- Extract Data returns fields of the page with the most extracted fields. Multi-document PDFs should be split first (PaperOffice AI split, see the AP inbox workflow in the repository above).
- Queue Document needs an existing review agent in PaperOffice AI (Workflow AI → HITL agents).

## Compatibility

Built and tested with n8n 1.x and 2.x (node API version 1). No runtime dependencies.

## Resources

- [PaperOffice AI API reference for AI coding agents (llms.txt)](https://api.paperoffice.ai/latest/docs/llms.txt)
- [OpenAPI description](https://api.paperoffice.ai/latest/docs/openapi.json)
- [Ready-made n8n workflows](https://github.com/paperoffice-ai/n8n-workflows)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## License

[MIT](LICENSE)
