import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { apiRequest } from '../PaperOfficeAi/GenericFunctions';
import { clean, withoutBilling } from '../PaperOfficeAi/shared';

/** Polls a workspace for documents that were added since the last poll (newest first, by document ID). */
export class PaperOfficeAiTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PaperOffice AI Trigger',
		name: 'paperOfficeAiTrigger',
		icon: { light: 'file:paperofficeai.svg', dark: 'file:paperofficeai.dark.svg' },
		group: ['trigger'],
		version: [1],
		subtitle: 'New document in workspace',
		description: 'Starts the workflow when a new document arrives in a PaperOffice AI workspace',
		defaults: { name: 'PaperOffice AI Trigger' },
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'paperOfficeAiApi', required: true }],
		properties: [
			{
				displayName: 'No specific plan is required. Usage is billed to your PaperOffice AI account as usual. Choose a poll interval that fits how often documents arrive.',
				name: 'paidNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Workspace Name or ID',
				name: 'workspaceId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getWorkspaces' },
				required: true,
				default: '',
				description: 'The workspace to watch. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Max Documents per Poll',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 100 },
				default: 50,
				description: 'Max number of results to return',
			},
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
		},
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const workspaceId = this.getNodeParameter('workspaceId') as number;
		const limit = this.getNodeParameter('limit') as number;
		const state = this.getWorkflowStaticData('node');
		const res = await apiRequest.call(this, 'POST', '/documents/documents-list', {
			body: { workspace_id: workspaceId, limit: 100, sort: 'created_datetime', order: 'DESC', flatten_folders: 1, page: 1 },
		});
		const docs = ((res.body.documents || []) as IDataObject[]).filter((d) => d && d.pofid && !d._is_folder_row);
		const maxId = docs.reduce((m, d) => Math.max(m, Number(d.documents_id) || 0), 0);
		const key = 'lastId_' + workspaceId;
		const lastId = Number(state[key] || 0);

		if (this.getMode() === 'manual') {
			// Test run: show the newest document so the user can map its fields
			return docs.length ? [[{ json: withoutBilling(docs[0]) }]] : null;
		}
		if (!lastId) {
			// First poll after activation: remember the newest document, report nothing old
			state[key] = maxId;
			return null;
		}
		const fresh = docs.filter((d) => Number(d.documents_id) > lastId).slice(0, limit);
		if (maxId > lastId) state[key] = maxId;
		if (!fresh.length) return null;
		return [fresh.reverse().map((d) => ({ json: withoutBilling(d) }))];
	}
}
