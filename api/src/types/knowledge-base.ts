export interface KnowledgeBaseAnnotation {
	id: string;
	organization_id: string;
	target_identifier: string;
	content: string;
	created_by: string;
	updated_by: string;
	created_at: string;
	updated_at: string;
}

export interface CreateKnowledgeBaseAnnotationInput {
	organization_id: string;
	target_identifier: string;
	content: string;
	user_id: string;
}

export interface UpdateKnowledgeBaseAnnotationInput {
	content: string;
	user_id: string;
}
