import {Neogma } from 'neogma';
import {ModelFactory} from "../../../utility/enhanced_model_factory";


export function UserModel(neogma: Neogma) {
    return ModelFactory(
        {
            name: 'User',
            label: 'User',
            schema: {
                id: {
                    type: 'string',
                    required: true,
                },
                name: {
                    type: 'string',
                    required: true,
                },
                email: {
                    type: 'string',
                    required: true,
                },
            },
            primaryKeyField: 'id',
            relationships: {
                OwnedDiagrams: {
                    model: 'Diagram',
                    direction: 'out',
                    name: 'OWNS',
                    properties: {},
                },
                CollaboratingDiagrams: {
                    model: 'Diagram',
                    direction: 'out',
                    name: 'COLLABORATOR_AT',
                    properties: {},
                },
            },
        },
        neogma,
    );
}
