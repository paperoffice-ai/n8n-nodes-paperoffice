import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IPollFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, sleep } from 'n8n-workflow';
import { API_BASE, API_HOST, formatError, isFinal, jobStatusOf, keyHint } from './shared';

type Ctx = IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions;

export interface ApiResponse {
	status: number;
	body: IDataObject;
	raw?: Buffer;
	headers?: IDataObject;
}

/**
 * One call to the PaperOffice AI API with the node's credential.
 * Errors carry the API message and error code; 401/403 explain where to create a key.
 */
export async function apiRequest(
	this: Ctx,
	method: IHttpRequestMethods,
	path: string,
	options: {
		body?: IDataObject | Buffer;
		qs?: IDataObject;
		form?: boolean;
		headers?: IDataObject;
		binary?: boolean;
		timeout?: number;
	} = {},
): Promise<ApiResponse> {
	const request: IHttpRequestOptions = {
		method,
		// Absolute URLs are only accepted on the API host, so the key never reaches another host
		url: path.startsWith('https://' + API_HOST + '/') ? path : API_BASE + path,
		qs: options.qs,
		headers: { Accept: 'application/json', ...(options.headers || {}) },
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		timeout: options.timeout ?? 120000,
	};
	if (options.body !== undefined) {
		if (Buffer.isBuffer(options.body)) {
			request.body = options.body;
		} else if (options.form) {
			const params = new URLSearchParams();
			for (const [k, v] of Object.entries(options.body)) {
				if (v === undefined || v === null || v === '') continue;
				params.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
			}
			request.body = params.toString();
			(request.headers as IDataObject)['Content-Type'] = 'application/x-www-form-urlencoded';
		} else {
			request.body = options.body;
			request.json = true;
		}
	}
	if (options.binary) request.encoding = 'arraybuffer';
	const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'paperOfficeAiApi', request)) as {
		statusCode: number;
		body: unknown;
		headers: IDataObject;
	};
	const status = Number(response.statusCode || 0);
	if (options.binary && status >= 200 && status < 300) {
		return { status, body: {}, raw: Buffer.from(response.body as ArrayBuffer), headers: response.headers };
	}
	let body: IDataObject = {};
	if (Buffer.isBuffer(response.body) || response.body instanceof ArrayBuffer) {
		const text = Buffer.from(response.body as ArrayBuffer).toString('utf8');
		try {
			body = JSON.parse(text) as IDataObject;
		} catch {
			body = { message: text.slice(0, 500) };
		}
	} else if (typeof response.body === 'string') {
		try {
			body = JSON.parse(response.body) as IDataObject;
		} catch {
			body = { message: response.body.slice(0, 500) };
		}
	} else if (response.body && typeof response.body === 'object') {
		body = response.body as IDataObject;
	}
	if (status >= 400 || body.status === 'error') {
		const hint = keyHint(status);
		throw new NodeApiError(this.getNode(), body as JsonObject, {
			message: hint || formatError(body, status),
			httpCode: String(status),
		});
	}
	return { status, body, headers: response.headers };
}

/**
 * Checks a job until it is finished or the wait budget is used up.
 * Every check is a paid API call, so the interval grows: 5, 10, 15, then every 20 seconds.
 */
export async function waitForJob(this: IExecuteFunctions, jobId: string, maxWaitSeconds: number): Promise<IDataObject> {
	const started = Date.now();
	const steps = [5000, 10000, 15000];
	let attempt = 0;
	let last: IDataObject = {};
	while (true) {
		const res = await apiRequest.call(this, 'GET', '/job/get/' + encodeURIComponent(jobId));
		last = res.body;
		if (isFinal(jobStatusOf(last))) return last;
		const wait = steps[attempt] ?? 20000;
		attempt++;
		if (Date.now() - started + wait > maxWaitSeconds * 1000) return last;
		await sleep(wait);
	}
}
