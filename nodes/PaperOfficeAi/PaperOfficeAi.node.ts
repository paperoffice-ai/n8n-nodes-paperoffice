import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { apiRequest, waitForJob } from './GenericFunctions';
import {
	documentAiFields,
	documentFields,
	humanReviewFields,
	notices,
	operationProperties,
	resourceProperty,
} from './PaperOfficeAiDescription';
import {
	buildMultipart,
	clean,
	flatFields,
	isFinal,
	isPdf,
	jobStatusOf,
	mapInvoice,
	redactedName,
	redactedPdfUrl,
	redactStats,
	withoutBilling,
} from './shared';

/**
 * Programmatic style: upload, extraction and redaction need several dependent calls per item
 * (multipart upload, job polling with growing intervals, download of the redacted PDF).
 */
export class PaperOfficeAi implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PaperOffice AI',
		name: 'paperOfficeAi',
		icon: { light: 'file:paperofficeai.svg', dark: 'file:paperofficeai.dark.svg' },
		group: ['transform'],
		version: [1],
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Archive documents, extract invoice data, redact PDFs, search your archive and queue documents for human review',
		defaults: { name: 'PaperOffice AI' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'paperOfficeAiApi', required: true }],
		properties: [
			...notices,
			resourceProperty,
			...operationProperties,
			...documentFields,
			...documentAiFields,
			...humanReviewFields,
		],
	};

	methods = {
		loadOptions: {
			async getWorkspaces(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const res = await apiRequest.call(this, 'GET', '/documents/workspaces-list', { qs: { take: 200 } });
				const list = (res.body.workspaces || res.body.data || []) as IDataObject[];
				return list
					.filter((w) => w && w.id !== undefined)
					.map((w) => ({ name: clean(w.name) || 'Workspace ' + clean(w.id), value: Number(w.id) }));
			},
			async getAgents(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const res = await apiRequest.call(this, 'GET', '/hitl_config/list');
				const list = (res.body.data || res.body.configs || []) as IDataObject[];
				return list
					.filter((a) => a && a.uuid)
					.map((a) => ({ name: clean(a.name) || clean(a.uuid), value: clean(a.uuid) }));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const pushJson = (json: IDataObject | IDataObject[]) => {
					for (const row of Array.isArray(json) ? json : [json]) returnData.push({ json: row, pairedItem: { item: i } });
				};

				if (resource === 'document') {
					if (operation === 'upload') {
						const workspaceId = this.getNodeParameter('workspaceId', i) as number;
						const prop = this.getNodeParameter('binaryPropertyName', i) as string;
						const opts = this.getNodeParameter('uploadOptions', i, {}) as IDataObject;
						const bin = this.helpers.assertBinaryData(i, prop);
						const buffer = await this.helpers.getBinaryDataBuffer(i, prop);
						const fileName = clean(opts.fileName) || bin.fileName || 'document';
						const form = buildMultipart(
							{ workspace_id: workspaceId, ai_dms_tier: clean(opts.aiDmsTier) },
							{ fieldName: 'file', buffer, fileName, mimeType: bin.mimeType },
						);
						const res = await apiRequest.call(this, 'POST', '/documents/document-put', {
							body: form.body,
							headers: { 'Content-Type': form.contentType },
							timeout: 300000,
						});
						pushJson(uploadRow.call(this, res.body, i));
					} else if (operation === 'uploadFromUrl') {
						const workspaceId = this.getNodeParameter('workspaceId', i) as number;
						const sourceUrl = clean(this.getNodeParameter('sourceUrl', i));
						if (!/^https:\/\//i.test(sourceUrl)) {
							throw new NodeOperationError(this.getNode(), 'Source URL must start with https://', { itemIndex: i });
						}
						const opts = this.getNodeParameter('uploadOptions', i, {}) as IDataObject;
						const res = await apiRequest.call(this, 'POST', '/documents/document-put', {
							body: { workspace_id: workspaceId, source_url: sourceUrl, ai_dms_tier: clean(opts.aiDmsTier) },
							form: true,
							timeout: 300000,
						});
						pushJson(uploadRow.call(this, res.body, i));
					} else if (operation === 'get') {
						const pofid = clean(this.getNodeParameter('pofid', i));
						const res = await apiRequest.call(this, 'GET', '/documents/document-get/' + encodeURIComponent(pofid));
						pushJson(withoutBilling((res.body.document as IDataObject) || res.body));
					} else if (operation === 'getText') {
						const pofid = clean(this.getNodeParameter('pofid', i));
						const page = this.getNodeParameter('page', i, 0) as number;
						const qs: IDataObject = { pofid, format: 'text' };
						if (page > 0) qs.page = page;
						const res = await apiRequest.call(this, 'GET', '/documents/ocr-get', { qs });
						const text = typeof res.body.data === 'string' ? res.body.data : clean(res.body.text || res.body.message);
						pushJson({ pofid, page: page > 0 ? page : null, text });
					} else if (operation === 'download') {
						const pofid = clean(this.getNodeParameter('pofid', i));
						const out = this.getNodeParameter('outputBinaryPropertyName', i) as string;
						const res = await apiRequest.call(this, 'GET', '/documents/document-download/' + encodeURIComponent(pofid), {
							binary: true,
							timeout: 300000,
						});
						const name = fileNameFrom(res.headers, pofid);
						const binary = await this.helpers.prepareBinaryData(res.raw as Buffer, name);
						returnData.push({ json: { pofid, fileName: name }, binary: { [out]: binary }, pairedItem: { item: i } });
					} else if (operation === 'search') {
						const res = await apiRequest.call(this, 'GET', '/documents/document-search', {
							qs: {
								query: clean(this.getNodeParameter('query', i)),
								workspace_id: this.getNodeParameter('workspaceId', i) as number,
								search_mode: this.getNodeParameter('searchMode', i) as string,
								limit: this.getNodeParameter('limit', i) as number,
							},
						});
						const docs = (res.body.documents || res.body.results || res.body.data || []) as IDataObject[];
						pushJson(docs.map((d) => withoutBilling(d)));
					} else if (operation === 'addTag') {
						const pofid = clean(this.getNodeParameter('pofid', i));
						const tagName = clean(this.getNodeParameter('tagName', i));
						const res = await apiRequest.call(this, 'POST', '/documents/document-tag-add', {
							body: { pofid, tag_name: tagName },
							form: true,
						});
						pushJson({ pofid, tagName, ...withoutBilling(res.body) });
					} else if (operation === 'checkDuplicates') {
						const pofid = clean(this.getNodeParameter('pofid', i));
						const res = await apiRequest.call(this, 'POST', '/documents/duplicate-check', { body: { pofid }, form: true });
						pushJson({ pofid, ...withoutBilling(res.body) });
					}
				} else if (resource === 'documentAi') {
					if (operation === 'extract' || operation === 'redact') {
						const fields: IDataObject =
							operation === 'extract'
								? {
										idp_collection:
											(this.getNodeParameter('collection', i) as string) === 'custom'
												? clean(this.getNodeParameter('customCollection', i))
												: (this.getNodeParameter('collection', i) as string),
										model: this.getNodeParameter('model', i) as string,
									}
								: redactFields.call(this, i);
						const job = await runJob.call(this, i, fields);
						const status = jobStatusOf(job);
						if (status === 'failed' || status === 'error') {
							throw new NodeOperationError(
								this.getNode(),
								'The PaperOffice AI job failed: ' + (clean(job.message) || 'no details') + ' (job ID: ' + clean(job.job_id) + ')',
								{ itemIndex: i },
							);
						}
						if (operation === 'extract') {
							pushJson(presentExtraction.call(this, job, i));
						} else {
							returnData.push(await presentRedaction.call(this, job, i));
						}
					} else if (operation === 'getJob') {
						const jobId = clean(this.getNodeParameter('jobId', i));
						const res = await apiRequest.call(this, 'GET', '/job/get/' + encodeURIComponent(jobId));
						pushJson(presentExtraction.call(this, res.body, i));
					}
				} else if (resource === 'humanReview') {
					if (operation === 'queue') {
						const agentUuid = clean(this.getNodeParameter('agentUuid', i));
						const pofid = clean(this.getNodeParameter('pofid', i));
						const res = await apiRequest.call(this, 'POST', '/hitl_config/enqueue', {
							body: { config_uuid: agentUuid, pofid },
							form: true,
						});
						pushJson({ pofid, agentUuid, ...withoutBilling(res.body) });
					} else if (operation === 'getAgents') {
						const res = await apiRequest.call(this, 'GET', '/hitl_config/list');
						const list = (res.body.data || res.body.configs || []) as IDataObject[];
						pushJson(list.map((a) => withoutBilling(a)));
					}
				} else if (resource === 'workspace' && operation === 'getMany') {
					const limit = this.getNodeParameter('limit', i) as number;
					const res = await apiRequest.call(this, 'GET', '/documents/workspaces-list', { qs: { take: limit } });
					const list = (res.body.workspaces || res.body.data || []) as IDataObject[];
					pushJson(list.slice(0, limit).map((w) => withoutBilling(w)));
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), { message: error.message } as JsonObject, { message: error.message, httpCode: error.httpCode ?? undefined, itemIndex: i });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}
		return [returnData];
	}
}

function uploadRow(this: IExecuteFunctions, data: IDataObject, itemIndex: number): IDataObject {
	const row = Array.isArray(data.results) ? (data.results[0] as IDataObject) : data;
	if (!row || row.status === 'error' || !row.pofid) {
		const detail = clean(row && (row.message || row.error)) || clean(data.message) || 'The document was not stored.';
		const code = clean(row && row.code) || clean(data.code);
		throw new NodeOperationError(this.getNode(), detail + (code ? ' (error code: ' + code + ')' : ''), { itemIndex });
	}
	return withoutBilling(row);
}

function fileNameFrom(headers: IDataObject | undefined, fallback: string): string {
	const disposition = clean(headers && (headers['content-disposition'] as string));
	const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
	if (star) return decodeURIComponent(star[1]);
	const plain = /filename="?([^";]+)"?/i.exec(disposition);
	return plain ? plain[1] : fallback;
}

function redactFields(this: IExecuteFunctions, i: number): IDataObject {
	const model = this.getNodeParameter('redactModel', i) as string;
	const mode = this.getNodeParameter('redactMode', i) as string;
	if (mode === 'pseudonymize' && model !== 'ultra') {
		throw new NodeOperationError(this.getNode(), 'Pseudonymize requires the Ultra model.', { itemIndex: i });
	}
	const opts = this.getNodeParameter('redactOptions', i, {}) as IDataObject;
	return {
		template: 'document_anonymize',
		model,
		scenario: this.getNodeParameter('scenario', i) as string,
		redact_mode: mode,
		whitelist: clean(opts.whitelist),
		custom_redact: clean(opts.customRedact),
		custom_instructions: clean(opts.customInstructions),
	};
}

/** Starts a document AI job (stored document or binary file) and optionally waits for it. */
async function runJob(this: IExecuteFunctions, i: number, fields: IDataObject): Promise<IDataObject> {
	const source = this.getNodeParameter('source', i) as string;
	const wait = this.getNodeParameter('waitForResult', i) as boolean;
	const maxWait = wait ? (this.getNodeParameter('maxWait', i) as number) : 0;
	// client_wait=true returns most results in the same answer, which saves paid status checks
	const all: IDataObject = { ...fields, client_wait: wait ? 'true' : 'false' };
	let res;
	if (source === 'binary') {
		const prop = this.getNodeParameter('binaryPropertyName', i) as string;
		const bin = this.helpers.assertBinaryData(i, prop);
		const buffer = await this.helpers.getBinaryDataBuffer(i, prop);
		const form = buildMultipart(all, { fieldName: 'file', buffer, fileName: bin.fileName || 'document.pdf', mimeType: bin.mimeType });
		res = await apiRequest.call(this, 'POST', '/job/add/workflow', {
			body: form.body,
			headers: { 'Content-Type': form.contentType },
			timeout: 330000,
		});
	} else {
		all.pofid = clean(this.getNodeParameter('pofid', i));
		res = await apiRequest.call(this, 'POST', '/job/add/workflow', { body: all, form: true, timeout: 330000 });
	}
	const job = res.body;
	const jobId = clean(job.job_id || job.workflow_job_id);
	if (!wait || isFinal(jobStatusOf(job)) || !jobId) return job;
	return waitForJob.call(this, jobId, maxWait);
}

function presentExtraction(this: IExecuteFunctions, job: IDataObject, i: number): IDataObject {
	const status = jobStatusOf(job);
	const jobId = clean(job.job_id || job.workflow_job_id);
	const includeRaw = this.getNodeParameter('includeRaw', i, false) as boolean;
	const out: IDataObject = { jobId, jobStatus: status || null, finished: isFinal(status) };
	if (status === 'completed') {
		const collection = clean(job.idp_collection || (this.getNodeParameter('collection', i, '') as string));
		Object.assign(out, collection.startsWith('invoice') || collection === '' ? mapInvoice(job) : {}, { fields: flatFields(job) });
	} else if (!isFinal(status)) {
		out.nextStep = 'The job is still running. Use Document AI → Get Job with this job ID later.';
	}
	if (includeRaw) out.raw = withoutBilling(job);
	return out;
}

async function presentRedaction(this: IExecuteFunctions, job: IDataObject, i: number): Promise<INodeExecutionData> {
	const status = jobStatusOf(job);
	const jobId = clean(job.job_id || job.workflow_job_id);
	if (status !== 'completed') {
		return {
			json: { jobId, jobStatus: status || null, finished: false, nextStep: 'The job is still running. Use Document AI → Get Job with this job ID later.' },
			pairedItem: { item: i },
		};
	}
	const result = (job.result || job.job_result) as IDataObject;
	const url = redactedPdfUrl(result);
	const res = await apiRequest.call(this, 'GET', url, { binary: true, timeout: 300000 });
	const buffer = res.raw as Buffer;
	if (!isPdf(buffer)) {
		throw new NodeOperationError(this.getNode(), 'The download from PaperOffice AI was not a PDF.', { itemIndex: i });
	}
	const source = this.getNodeParameter('source', i) as string;
	let sourceName = 'document';
	if (source === 'binary') {
		const prop = this.getNodeParameter('binaryPropertyName', i) as string;
		sourceName = this.helpers.assertBinaryData(i, prop).fileName || sourceName;
	}
	const fileName = redactedName(sourceName);
	const out = this.getNodeParameter('outputBinaryPropertyName', i) as string;
	const binary = await this.helpers.prepareBinaryData(buffer, fileName, 'application/pdf');
	return {
		json: { jobId, jobStatus: status, finished: true, fileName, ...redactStats(result) },
		binary: { [out]: binary },
		pairedItem: { item: i },
	};
}
