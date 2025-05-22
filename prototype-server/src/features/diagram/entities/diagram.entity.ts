import { User } from 'src/features/user/entities/user.entity';

export class Diagram {
  id: string;
  title: string;
  json: string;
  ownerId: string;
  owner?: User | null;
  collaborators?: User[] | null;
}
