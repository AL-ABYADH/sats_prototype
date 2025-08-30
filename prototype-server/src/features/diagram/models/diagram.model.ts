import { Neogma } from 'neogma';
import { ModelFactory } from "../../../utility/enhanced_model_factory";

export function DiagramModel(neogma: Neogma) {
    return ModelFactory(
        {
            name: 'Diagram',
            label: 'Diagram',
            schema: {
                id: {
                    type: 'string',
                    required: true,
                },
                title: {
                    type: 'string',
                    required: true,
                },
                json: {
                    type: 'string',
                    required: false,
                },
                ownerId: {
                    type: 'string',
                    required: true,
                },
            },
            primaryKeyField: 'id',
            relationships: {
                Owner: {
                    model: 'User',
                    direction: 'in',
                    name: 'OWNS',
                    properties: {},
                    cardinality: 'one' // رسم بياني واحد له مالك واحد فقط
                },
                Collaborators: {
                    model: 'User',
                    direction: 'in',
                    name: 'COLLABORATOR_AT',
                    properties: {},
                    cardinality: 'many' // رسم بياني واحد يمكن أن يكون له عدة متعاونين
                },
            }
        },
        neogma,
    );
}