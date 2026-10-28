// Unit tests for the pure helpers (no API calls). Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('../dist/nodes/PaperOfficeAi/shared.js');

test('mapInvoice reads object-form suggested_fields and skips VALUE_MISSING', () => {
	const job = {
		result: {
			pages_idp: [
				{ suggested_fields: { _invoice_number: { value: 'X' } } },
				{
					suggested_fields: {
						_invoice_number: { value: 'VA-2026-1034' },
						_invoice_date: { value: '09.10.2026', value_raw: '2026-10-09' },
						_total_amount: { value: '6.012,48 EUR', value_raw: '6012.48' },
						_creditor_iban: { value: 'DE50 9999 0000 0012 3456 78' },
						_supplier_vat_id: { value: 'VALUE_MISSING' },
					},
					__document__data__idp__missing_required_count: 0,
				},
			],
		},
	};
	const out = s.mapInvoice(job);
	assert.equal(out.invoiceNumber, 'VA-2026-1034');
	assert.equal(out.invoiceDate, '2026-10-09');
	assert.equal(out.totalAmount, 6012.48);
	assert.equal(out.iban, 'DE50 9999 0000 0012 3456 78');
	assert.equal(out.supplierVatId, null);
	assert.equal(out.missingRequiredCount, 0);
});

test('mapInvoice reads array-form suggested_fields', () => {
	const out = s.mapInvoice({ result: { pages_idp: [{ suggested_fields: [{ key: '_invoice_number', value: 'A-1' }, { category: '_currency', value: 'EUR' }] }] } });
	assert.equal(out.invoiceNumber, 'A-1');
	assert.equal(out.currency, 'EUR');
});

test('mapInvoice without result returns nulls', () => {
	const out = s.mapInvoice({});
	assert.equal(out.invoiceNumber, null);
	assert.equal(out.totalAmount, null);
});

test('flatFields strips leading underscores and VALUE_MISSING', () => {
	const out = s.flatFields({ result: { pages_idp: [{ suggested_fields: { _order_number: { value: 'PO-1' }, _x: { value: 'VALUE_MISSING' } } }] } });
	assert.deepEqual(out, { order_number: 'PO-1' });
});

test('redactedPdfUrl accepts only the API host', () => {
	assert.equal(s.redactedPdfUrl({ anonymized_pdf: ['https://api.paperoffice.ai/latest/x.pdf'] }), 'https://api.paperoffice.ai/latest/x.pdf');
	assert.throws(() => s.redactedPdfUrl({ anonymized_pdf: 'https://evil.example/x.pdf' }), /does not point/);
	assert.throws(() => s.redactedPdfUrl({}), /without a download link/);
});

test('formatError and keyHint', () => {
	assert.equal(s.formatError({ message: 'Nope', code: 'X1', job_id: 'j' }, 400), '[400] Nope (error code: X1) (job ID: j)');
	assert.match(s.keyHint(401), /Create a User token/);
	assert.equal(s.keyHint(500), '');
});

test('jobStatusOf and isFinal', () => {
	assert.equal(s.jobStatusOf({ job_status: 'COMPLETED' }), 'completed');
	assert.equal(s.isFinal('processing'), false);
	assert.equal(s.isFinal('failed'), true);
});

test('buildMultipart puts fields and file in the body', () => {
	const m = s.buildMultipart({ workspace_id: 7, empty: '' }, { fieldName: 'file', buffer: Buffer.from('%PDF-1.4'), fileName: 'a"b.pdf', mimeType: 'application/pdf' });
	const text = m.body.toString('utf8');
	assert.match(m.contentType, /^multipart\/form-data; boundary=/);
	assert.match(text, /name="workspace_id"\r\n\r\n7\r\n/);
	assert.doesNotMatch(text, /name="empty"/);
	assert.match(text, /filename="a_b.pdf"/);
	assert.match(text, /%PDF-1\.4/);
});

test('withoutBilling removes billing blocks', () => {
	assert.deepEqual(s.withoutBilling({ a: 1, _billing: {}, _billing_summary: {} }), { a: 1 });
});

test('redactedName and isPdf', () => {
	assert.equal(s.redactedName('Invoice 1.pdf'), 'Invoice 1_redacted.pdf');
	assert.equal(s.isPdf(Buffer.from('%PDF-1.7')), true);
	assert.equal(s.isPdf(Buffer.from('{"a":1}')), false);
});
