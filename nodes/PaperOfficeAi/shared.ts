/**
 * Pure helpers without network calls, so they can be unit tested without the API.
 * Field mapping and error texts follow the PaperOffice AI apps for Zapier and Make.
 */
import type { IDataObject } from 'n8n-workflow';

export const API_HOST = 'api.paperoffice.ai';
export const API_BASE = 'https://api.paperoffice.ai/latest';
export const DOCS_URL = 'https://api.paperoffice.ai/latest/docs/llms.txt';
export const KEY_PAGE = 'https://app.paperoffice.ai/en/paperoffice-account/api';

export function clean(value: unknown): string {
	if (value === undefined || value === null) return '';
	return String(value).trim();
}

export function messageOf(data: unknown): string {
	const fallback = 'PaperOffice AI returned an error.';
	if (!data) return fallback;
	if (typeof data === 'string') return data.trim() ? data.trim().slice(0, 500) : fallback;
	const obj = data as IDataObject;
	if (typeof obj.message === 'string' && obj.message.trim()) return obj.message.trim();
	if (obj.message && typeof obj.message === 'object') {
		const msg = obj.message as IDataObject;
		return clean(msg.external) || clean(msg.internal) || fallback;
	}
	if (typeof obj.error === 'string' && obj.error.trim()) return obj.error.trim();
	return fallback;
}

export function formatError(data: unknown, status?: number | string): string {
	const obj = data && typeof data === 'object' ? (data as IDataObject) : {};
	const code = clean(obj.code) || clean(obj.error_code);
	let out = '[' + (status || 'error') + '] ' + messageOf(data);
	if (code) out += ' (error code: ' + code + ')';
	if (obj.job_id) out += ' (job ID: ' + clean(obj.job_id) + ')';
	return out;
}

export function keyHint(status: number): string {
	if (status === 401 || status === 403) {
		return 'PaperOffice AI rejected the API key (HTTP ' + status + '). Create a User token (po_ut_…) under Account → API: ' + KEY_PAGE;
	}
	return '';
}

export function jobStatusOf(data: unknown): string {
	const obj = (data || {}) as IDataObject;
	return clean(obj.job_status || obj.status).toLowerCase();
}

export function isFinal(status: string): boolean {
	return status === 'completed' || status === 'failed' || status === 'error' || status === 'cancelled';
}

function safeNumber(raw: unknown): number | null {
	if (raw === undefined || raw === null || raw === '' || raw === 'VALUE_MISSING') return null;
	const text = String(raw).trim();
	if (!/^-?[0-9]+(\.[0-9]+)?$/.test(text)) return null;
	return Number(text);
}

function pagesList(result: unknown): IDataObject[] {
	const raw = result && (result as IDataObject).pages_idp;
	if (Array.isArray(raw)) return raw as IDataObject[];
	if (raw && typeof raw === 'object') return Object.values(raw as IDataObject) as IDataObject[];
	return [];
}

/** The page with the most suggested fields carries the document level values. */
function bestPage(result: unknown): IDataObject | null {
	let best: IDataObject | null = null;
	let bestCount = -1;
	for (const page of pagesList(result)) {
		const fields = page && (page.suggested_fields as IDataObject | IDataObject[] | undefined);
		if (!fields || typeof fields !== 'object') continue;
		const count = Array.isArray(fields) ? fields.length : Object.keys(fields).length;
		if (count > bestCount) {
			best = page;
			bestCount = count;
		}
	}
	return best;
}

/** suggested_fields is an object keyed by field, or an array of { key | category, value, value_raw }. */
function suggested(page: IDataObject | null, key: string): IDataObject | null {
	const fields = page && (page.suggested_fields as IDataObject | IDataObject[] | undefined);
	if (!fields) return null;
	const item = Array.isArray(fields)
		? fields.find((x) => x && (x.key === key || x.category === key))
		: (fields[key] as IDataObject | undefined);
	if (!item || typeof item !== 'object' || item.value === 'VALUE_MISSING') return null;
	return item;
}

function textField(page: IDataObject | null, key: string): string | null {
	const item = suggested(page, key);
	if (!item || item.value === undefined || item.value === null || item.value === '') return null;
	return String(item.value);
}

function rawField(page: IDataObject | null, key: string): string | null {
	const item = suggested(page, key);
	if (!item) return null;
	const raw = item.value_raw;
	if (raw === undefined || raw === null || raw === '' || raw === 'VALUE_MISSING') return null;
	return String(raw);
}

function amountField(page: IDataObject | null, key: string): number | null {
	const item = suggested(page, key);
	return item ? safeNumber(item.value_raw) : null;
}

function listField(page: IDataObject | null, key: string): unknown {
	const item = suggested(page, key);
	return item ? item.value : null;
}

/** Invoice fields of a finished extraction job (idp_collection invoice). */
export function mapInvoice(job: IDataObject): IDataObject {
	const page = bestPage(job && (job.result || job.job_result));
	return {
		invoiceNumber: textField(page, '_invoice_number'),
		invoiceDate: rawField(page, '_invoice_date'),
		dueDate: rawField(page, '_payment_due_date'),
		supplierName: textField(page, '_supplier_name'),
		supplierAddress: textField(page, '_supplier_address'),
		supplierVatId: textField(page, '_supplier_vat_id'),
		customerName: textField(page, '_customer_name'),
		customerNumber: textField(page, '_customer_number'),
		customerAddress: textField(page, '_customer_address'),
		orderNumber: textField(page, '_order_number'),
		netAmount: amountField(page, '_net_amount'),
		vatAmount: amountField(page, '_vat_amount'),
		totalAmount: amountField(page, '_total_amount'),
		currency: textField(page, '_currency'),
		paymentTerms: textField(page, '_payment_terms'),
		iban: textField(page, '_creditor_iban'),
		bic: textField(page, '_creditor_bic'),
		bankName: textField(page, '_creditor_bank_name'),
		lineItems: listField(page, '_line_items') as IDataObject[] | null,
		vatBreakdown: listField(page, '_vat_breakdown') as IDataObject[] | null,
		missingRequiredCount:
			page && page.__document__data__idp__missing_required_count != null
				? Number(page.__document__data__idp__missing_required_count)
				: null,
	};
}

/** All suggested fields of the best page as { key: value }, for collections other than invoice. */
export function flatFields(job: IDataObject): IDataObject {
	const page = bestPage(job && (job.result || job.job_result));
	const out: IDataObject = {};
	const fields = page && (page.suggested_fields as IDataObject | IDataObject[] | undefined);
	if (!fields) return out;
	const entries: Array<[string, IDataObject]> = Array.isArray(fields)
		? fields.filter((f) => f && (f.key || f.category)).map((f) => [String(f.key || f.category), f])
		: (Object.entries(fields) as Array<[string, IDataObject]>);
	for (const [key, item] of entries) {
		if (!item || typeof item !== 'object' || item.value === 'VALUE_MISSING') continue;
		out[key.replace(/^_+/, '')] = item.value as IDataObject[keyof IDataObject];
	}
	return out;
}

/** First download link of a redaction that points to the API host; any other host is refused. */
export function redactedPdfUrl(result: unknown): string {
	const raw = result && (result as IDataObject).anonymized_pdf;
	const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
	let foreign = false;
	for (const item of list) {
		if (typeof item !== 'string') continue;
		if (item.startsWith('https://' + API_HOST + '/')) return item;
		if (item.startsWith('http')) foreign = true;
	}
	if (foreign) {
		throw new Error('The redacted PDF link does not point to https://' + API_HOST + '/. The download was stopped so that the API key is not sent to another host.');
	}
	throw new Error('The redaction finished without a download link.');
}

export function redactStats(result: unknown): IDataObject {
	const detected = ((result && (result as IDataObject).detected_pii) || {}) as IDataObject;
	const boxes = Array.isArray(detected.redact_box_ids) ? detected.redact_box_ids.length : 0;
	const partial = Array.isArray(detected.partial_redactions) ? detected.partial_redactions.length : 0;
	const perPage = detected.redact_boxes_per_page;
	return {
		redactMode: detected.redact_mode || null,
		redactedRegions: boxes + partial,
		pagesWithRedactions: perPage && typeof perPage === 'object' ? Object.keys(perPage).length : null,
	};
}

export function redactedName(source: string): string {
	const base = clean(source).replace(/\.[A-Za-z0-9]{1,5}$/, '') || 'document';
	return base + '_redacted.pdf';
}

export function isPdf(buffer: Buffer): boolean {
	return !!buffer && buffer.length >= 5 && buffer.subarray(0, 5).toString('utf8') === '%PDF-';
}

/** multipart/form-data without dependencies. */
export function buildMultipart(
	fields: IDataObject,
	file: { fieldName: string; buffer: Buffer; fileName: string; mimeType: string },
): { body: Buffer; contentType: string } {
	const boundary = '----PaperOfficeN8n' + Date.now().toString(16) + Math.random().toString(16).slice(2);
	const parts: Buffer[] = [];
	for (const [name, value] of Object.entries(fields)) {
		if (value === undefined || value === null || value === '') continue;
		parts.push(
			Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="' + name + '"\r\n\r\n' + String(value) + '\r\n', 'utf8'),
		);
	}
	const safeName = file.fileName.replace(/["\r\n]/g, '_');
	parts.push(
		Buffer.from(
			'--' + boundary + '\r\nContent-Disposition: form-data; name="' + file.fieldName + '"; filename="' + safeName + '"\r\nContent-Type: ' + (file.mimeType || 'application/octet-stream') + '\r\n\r\n',
			'utf8',
		),
	);
	parts.push(file.buffer);
	parts.push(Buffer.from('\r\n--' + boundary + '--\r\n', 'utf8'));
	return { body: Buffer.concat(parts), contentType: 'multipart/form-data; boundary=' + boundary };
}

/** Removes billing details from responses so the output only carries document data. */
export function withoutBilling(data: IDataObject): IDataObject {
	const out: IDataObject = {};
	for (const [key, value] of Object.entries(data || {})) {
		if (key === '_billing' || key === '_billing_summary') continue;
		out[key] = value;
	}
	return out;
}
