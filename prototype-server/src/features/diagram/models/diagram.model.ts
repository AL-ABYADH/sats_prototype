import {Neogma } from 'neogma';
import {ModelFactory} from "../../../utility/enhanced_model_factory";

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
          },
          Collaborators: {
            model: 'User',
            direction: 'in',
            name: 'COLLABORATOR_AT',
            properties: {},
          },
        }
      },
      neogma,
  );
}
