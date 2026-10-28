import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class PaperOfficeAiApi implements ICredentialType {
	name = 'paperOfficeAiApi';

	displayName = 'PaperOffice AI API';

	icon: Icon = { light: 'file:paperofficeai.svg', dark: 'file:paperofficeai.dark.svg' };

	documentationUrl = 'https://github.com/paperoffice-ai/n8n-nodes-paperoffice?tab=readme-ov-file#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'A User token (po_ut_…), Group token (po_gt_…) or Secret key (po_sk_…) from Account → API in PaperOffice AI. Publishable keys (po_pk_…) do not work here.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey.trim()}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.paperoffice.ai/latest',
			url: '/paperoffice_account/mcp-token-capabilities',
		},
	};
}
