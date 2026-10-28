import type { INodeProperties } from 'n8n-workflow';

const PAID = 'No specific plan is required. Usage is billed to your PaperOffice AI account as usual.';

const show = (resource: string, operation: string[]) => ({ show: { resource: [resource], operation } });

export const resourceProperty: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	options: [
		{ name: 'Document', value: 'document' },
		{ name: 'Document AI', value: 'documentAi' },
		{ name: 'Human Review', value: 'humanReview' },
		{ name: 'Workspace', value: 'workspace' },
	],
	default: 'document',
};

export const operationProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['document'] } },
		options: [
			{ name: 'Add Tag', value: 'addTag', description: 'Add a tag to a document', action: 'Add a tag to a document' },
			{ name: 'Check Duplicates', value: 'checkDuplicates', description: 'Find documents that may be duplicates of a document', action: 'Check a document for duplicates' },
			{ name: 'Download', value: 'download', description: 'Download the file of a document', action: 'Download a document' },
			{ name: 'Get', value: 'get', description: 'Get the details of a document', action: 'Get a document' },
			{ name: 'Get Text', value: 'getText', description: 'Get the OCR text of a document', action: 'Get the text of a document' },
			{ name: 'Search', value: 'search', description: 'Search documents in a workspace', action: 'Search documents' },
			{ name: 'Upload', value: 'upload', description: 'Store a file in a workspace', action: 'Upload a document' },
			{ name: 'Upload From URL', value: 'uploadFromUrl', description: 'Store a file from a public URL in a workspace', action: 'Upload a document from a URL' },
		],
		default: 'upload',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['documentAi'] } },
		options: [
			{ name: 'Extract Data', value: 'extract', description: 'Read structured data, for example invoice fields, from a document', action: 'Extract data from a document' },
			{ name: 'Get Job', value: 'getJob', description: 'Get the status and result of a document AI job', action: 'Get a document AI job' },
			{ name: 'Redact PDF', value: 'redact', description: 'Black out or pseudonymize personal data in a document', action: 'Redact a document' },
		],
		default: 'extract',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['humanReview'] } },
		options: [
			{ name: 'Get Many Agents', value: 'getAgents', description: 'List your human review (HITL) agents', action: 'Get many review agents' },
			{ name: 'Queue Document', value: 'queue', description: 'Send a document to a human review agent', action: 'Queue a document for human review' },
		],
		default: 'queue',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['workspace'] } },
		options: [{ name: 'Get Many', value: 'getMany', description: 'List your workspaces', action: 'Get many workspaces' }],
		default: 'getMany',
	},
];

const workspaceField = (resource: string, operation: string[]): INodeProperties => ({
	displayName: 'Workspace Name or ID',
	name: 'workspaceId',
	type: 'options',
	typeOptions: { loadOptionsMethod: 'getWorkspaces' },
	required: true,
	default: '',
	description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	displayOptions: show(resource, operation),
});

const pofidField = (resource: string, operation: string[], extraShow: Record<string, string[]> = {}): INodeProperties => ({
	displayName: 'Document ID (Pofid)',
	name: 'pofid',
	type: 'string',
	required: true,
	default: '',
	placeholder: 'e.g. 5a5b4f1b….pdf',
	description: 'The pofid of the document, as returned by Upload or Search',
	displayOptions: { show: { resource: [resource], operation, ...extraShow } },
});

const binaryField = (resource: string, operation: string[], extraShow: Record<string, string[]> = {}): INodeProperties => ({
	displayName: 'Input Binary Field',
	name: 'binaryPropertyName',
	type: 'string',
	required: true,
	default: 'data',
	hint: 'The name of the input binary field containing the file',
	displayOptions: { show: { resource: [resource], operation, ...extraShow } },
});

const sourceField = (resource: string, operation: string[]): INodeProperties => ({
	displayName: 'Source',
	name: 'source',
	type: 'options',
	options: [
		{ name: 'Stored Document (Pofid)', value: 'pofid' },
		{ name: 'Binary File', value: 'binary' },
	],
	default: 'pofid',
	description: 'Use a document already stored in PaperOffice AI, or send a file from this workflow',
	displayOptions: show(resource, operation),
});

const waitFields = (resource: string, operation: string[]): INodeProperties[] => [
	{
		displayName: 'Wait for Result',
		name: 'waitForResult',
		type: 'boolean',
		default: true,
		description: 'Whether to wait until the job is finished. If off, the node returns the job ID; use Get Job later.',
		displayOptions: show(resource, operation),
	},
	{
		displayName: 'Max Wait (Seconds)',
		name: 'maxWait',
		type: 'number',
		typeOptions: { minValue: 30, maxValue: 900 },
		default: 300,
		description: 'How long to wait for a long-running job. Status checks become less frequent over time.',
		displayOptions: { show: { resource: [resource], operation, waitForResult: [true] } },
	},
];

export const documentFields: INodeProperties[] = [
	// Upload
	workspaceField('document', ['upload', 'uploadFromUrl', 'search']),
	binaryField('document', ['upload']),
	{
		displayName: 'Source URL',
		name: 'sourceUrl',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://example.com/invoice.pdf',
		description: 'A public HTTPS URL of the file to store',
		displayOptions: show('document', ['uploadFromUrl']),
	},
	{
		displayName: 'Options',
		name: 'uploadOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: show('document', ['upload', 'uploadFromUrl']),
		options: [
			{
				displayName: 'File Name',
				name: 'fileName',
				type: 'string',
				default: '',
				description: 'Overrides the file name of the binary file',
			},
			{
				displayName: 'AI-DMS Tier',
				name: 'aiDmsTier',
				type: 'options',
				options: [
					{ name: 'Basic', value: 'basic' },
					{ name: 'Disabled', value: 'disabled' },
					{ name: 'Premium', value: 'premium' },
					{ name: 'Ultra', value: 'ultra' },
					{ name: 'Workspace Default', value: '' },
				],
				default: '',
				description: 'Automatic AI-DMS analysis after upload (paid). Empty uses the workspace setting.',
			},
		],
	},
	pofidField('document', ['get', 'getText', 'download', 'addTag', 'checkDuplicates']),
	{
		displayName: 'Page',
		name: 'page',
		type: 'number',
		typeOptions: { minValue: 0 },
		default: 0,
		description: 'Page number to read. 0 returns the text of all pages.',
		displayOptions: show('document', ['getText']),
	},
	{
		displayName: 'Put Output File in Field',
		name: 'outputBinaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		hint: 'The name of the output binary field to put the file in',
		displayOptions: { show: { resource: ['document', 'documentAi'], operation: ['download', 'redact'] } },
	},
	{
		displayName: 'Tag Name',
		name: 'tagName',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. approved',
		displayOptions: show('document', ['addTag']),
	},
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. invoice 2026-1034',
		description: 'Words, an invoice number, an IBAN or a supplier name',
		displayOptions: show('document', ['search']),
	},
	{
		displayName: 'Search Mode',
		name: 'searchMode',
		type: 'options',
		options: [
			{ name: 'Full Text', value: 'fulltext' },
			{ name: 'Hybrid', value: 'hybrid' },
			{ name: 'Semantic', value: 'semantic' },
		],
		default: 'fulltext',
		displayOptions: show('document', ['search']),
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 100 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: { resource: ['document', 'workspace'], operation: ['search', 'getMany'] } },
	},
];

export const documentAiFields: INodeProperties[] = [
	sourceField('documentAi', ['extract', 'redact']),
	pofidField('documentAi', ['extract', 'redact'], { source: ['pofid'] }),
	binaryField('documentAi', ['extract', 'redact'], { source: ['binary'] }),
	{
		displayName: 'Data Type',
		name: 'collection',
		type: 'options',
		options: [
			{ name: 'Custom', value: 'custom' },
			{ name: 'Delivery Note', value: 'delivery_note' },
			{ name: 'Invoice', value: 'invoice' },
			{ name: 'Purchase Order', value: 'purchase_order' },
			{ name: 'Receipt', value: 'receipt' },
		],
		default: 'invoice',
		description: 'Which fields to read. Invoice returns a fixed set of invoice fields.',
		displayOptions: show('documentAi', ['extract']),
	},
	{
		displayName: 'Custom Collection',
		name: 'customCollection',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. invoice:de:DE',
		description: 'An extraction profile name, optionally with a locale for localized output',
		displayOptions: { show: { resource: ['documentAi'], operation: ['extract'], collection: ['custom'] } },
	},
	{
		displayName: 'Model',
		name: 'model',
		type: 'options',
		options: [
			{ name: 'Basic', value: 'basic' },
			{ name: 'Basic Pro', value: 'basic-pro' },
			{ name: 'Basic Pro Max', value: 'basic-pro-max' },
			{ name: 'Premium', value: 'premium' },
			{ name: 'Premium Pro', value: 'premium-pro' },
			{ name: 'Premium Pro Max', value: 'premium-pro-max' },
			{ name: 'Ultra', value: 'ultra' },
			{ name: 'Ultra Pro', value: 'ultra-pro' },
			{ name: 'Ultra Pro Max', value: 'ultra-pro-max' },
		],
		default: 'basic-pro-max',
		description: 'Basic = OCR + vision, Premium = + AI thinking, Ultra = + AI reasoning. Pro and Pro Max allow more pages.',
		displayOptions: show('documentAi', ['extract']),
	},
	{
		displayName: 'Model',
		name: 'redactModel',
		type: 'options',
		options: [
			{ name: 'Basic', value: 'basic' },
			{ name: 'Premium', value: 'premium' },
			{ name: 'Ultra', value: 'ultra' },
		],
		default: 'premium',
		description: 'Higher models detect more personal data. Pseudonymize requires Ultra.',
		displayOptions: show('documentAi', ['redact']),
	},
	{
		displayName: 'Scenario',
		name: 'scenario',
		type: 'options',
		options: [
			{ name: 'Contact Data', value: 'contact_data' },
			{ name: 'Court Proceedings', value: 'court_proceedings' },
			{ name: 'Custom', value: 'custom' },
			{ name: 'External Sharing', value: 'external_sharing' },
			{ name: 'Financial Data', value: 'financial_data' },
			{ name: 'GDPR Subject Access Request', value: 'gdpr_disclosure' },
			{ name: 'HR Personnel File', value: 'hr_personnel_file' },
			{ name: 'Internal Audit', value: 'internal_audit' },
			{ name: 'Medical Records', value: 'medical_records' },
			{ name: 'Public Publication', value: 'public_publication' },
			{ name: 'Research', value: 'research' },
			{ name: 'Whistleblower Report', value: 'whistleblower' },
		],
		default: 'external_sharing',
		description: 'The redaction policy. It decides what must stay visible.',
		displayOptions: show('documentAi', ['redact']),
	},
	{
		displayName: 'Mode',
		name: 'redactMode',
		type: 'options',
		options: [
			{ name: 'Black Boxes', value: 'blackout' },
			{ name: 'Pseudonymize', value: 'pseudonymize' },
		],
		default: 'blackout',
		description: 'Pseudonymize replaces personal data with consistent fictitious values so the document stays readable (Ultra model only)',
		displayOptions: show('documentAi', ['redact']),
	},
	{
		displayName: 'Options',
		name: 'redactOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: show('documentAi', ['redact']),
		options: [
			{
				displayName: 'Always Redact',
				name: 'customRedact',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'Terms that must always be redacted, one per line',
			},
			{
				displayName: 'Instructions',
				name: 'customInstructions',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'Free-text policy for the AI, for example: Keep all product names visible',
			},
			{
				displayName: 'Keep Visible',
				name: 'whitelist',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'Terms that must stay visible, one per line, for example your own company name',
			},
		],
	},
	...waitFields('documentAi', ['extract', 'redact']),
	{
		displayName: 'Job ID',
		name: 'jobId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: show('documentAi', ['getJob']),
	},
	{
		displayName: 'Include Raw Result',
		name: 'includeRaw',
		type: 'boolean',
		default: false,
		description: 'Whether to add the full job result (all pages, positions and confidence) to the output',
		displayOptions: show('documentAi', ['extract', 'getJob']),
	},
];

export const humanReviewFields: INodeProperties[] = [
	{
		displayName: 'Review Agent Name or ID',
		name: 'agentUuid',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getAgents' },
		required: true,
		default: '',
		description: 'The human review (HITL) agent that defines reviewers, review fields and the decision webhook. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: show('humanReview', ['queue']),
	},
	pofidField('humanReview', ['queue']),
];

export const notices: INodeProperties[] = [
	{
		displayName: PAID,
		name: 'paidNotice',
		type: 'notice',
		default: '',
	},
];
