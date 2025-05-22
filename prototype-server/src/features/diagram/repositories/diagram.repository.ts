import { Injectable } from '@nestjs/common';
import { Diagram } from '../entities/diagram.entity';
import { v4 as uuidv4 } from 'uuid';
import { DiagramModel } from '../models/diagram.model';
import { UserModel } from '../../user/models/user.model';
import { Neogma } from 'neogma';
import { InjectNeogma } from '../../../utility/neogma_provider';

/**
 * Repository class for handling Diagram data operations with Neo4j database
 * Manages diagrams, user relationships, and collaboration features
 * Uses Neogma OGM for database interactions
 */
@Injectable()
export class DiagramRepository {
  private diagramModel: any;
  private userModel: any;

  /**
   * Initialize the DiagramRepository with Neogma instance
   * Sets up both diagram and user models for relationship management
   * @param neogma - Neogma instance for database connectivity
   */
  constructor(@InjectNeogma() private readonly neogma: Neogma) {
    this.diagramModel = DiagramModel(neogma);
    this.userModel = UserModel(neogma);
  }

  /**
   * Retrieve all diagrams from the database with their relationships
   * @returns Promise<Diagram[]> - Array of all diagrams with related data or empty array on error
   */
  async list(): Promise<Diagram[]> {
    try {
      return await this.diagramModel.findManyWithRelations({});
    } catch (error) {
      console.error('Error fetching diagrams:', error);
      return [];
    }
  }

  /**
   * Retrieve all diagrams owned or collaborated on by a specific user
   * @param userId - ID of the user whose diagrams to retrieve
   * @returns Promise<Diagram[]> - Array of user's diagrams or empty array on error
   */
  async listUserDiagrams(userId: string): Promise<Diagram[]> {
    try {
      return await this.userModel.findOneWithRelations({ id: userId });
    } catch (error) {
      console.error('Error fetching user diagrams:', error);
      return [];
    }
  }

  /**
   * Find a diagram by its unique ID with all relationships loaded
   * @param id - Diagram's unique identifier
   * @returns Promise<Diagram | null> - Diagram object with relationships if found, null otherwise
   */
  async findById(id: string): Promise<Diagram | null> {
    try {
      return await this.diagramModel.findOneWithRelations({ id });
    } catch (error) {
      console.error('Error finding diagram by id:', error);
      return null;
    }
  }

  /**
   * Create a new diagram in the database and establish owner relationship
   * @param dto - Partial diagram object with required fields
   * @returns Promise<Diagram> - Created diagram object with owner and collaborator relationships
   * @throws Error if creation fails
   */
  async create(dto: Partial<Diagram>): Promise<Diagram> {
    try {
      const diagram = await this.diagramModel.createOne({
        id: uuidv4(),
        title: dto.title || '',
        ownerId: dto.ownerId || '',
        json: dto.json || '',
      });

      // Establish ownership relationship if owner ID is provided
      if (dto.ownerId) {
        const owner = await this.userModel.findOne({
          where: { id: dto.ownerId },
        });

        if (owner) {
          await owner.relateTo({
            alias: 'OwnedDiagrams',
            where: { id: diagram.id },
          });

          return {
            ...diagram.getDataValues(),
            owner: owner.getDataValues(),
            collaborators: [],
          } as Diagram;
        }
      }

      // Return diagram without owner if no valid owner found
      return {
        ...diagram.getDataValues(),
        owner: null,
        collaborators: [],
      } as Diagram;
    } catch (error) {
      console.error('Error creating diagram:', error);
      throw error;
    }
  }

  /**
   * Update an existing diagram's information
   * @param diagramId - ID of the diagram to update
   * @param updates - Partial diagram object containing fields to update
   * @returns Promise<Diagram | null> - Updated diagram object with relationships or null if not found
   */
  async update(
      diagramId: string,
      updates: Partial<Diagram>,
  ): Promise<Diagram | null> {
    try {
      const [updatedDiagrams] = await this.diagramModel.update(updates, {
        where: { id: diagramId },
        return: true,
      });

      if (updatedDiagrams.length === 0) {
        return null;
      }

      // Refetch the diagram with all relationships to ensure data consistency
      return this.findById(diagramId);
    } catch (error) {
      console.error('Error updating diagram:', error);
      return null;
    }
  }

  /**
   * Delete a diagram from the database and detach all relationships
   * @param diagramId - ID of the diagram to delete
   * @returns Promise<boolean> - true if deletion was successful, false otherwise
   */
  async delete(diagramId: string): Promise<boolean> {
    try {
      const deleteCount = await this.diagramModel.delete({
        detach: true, // Removes all relationships before deletion
        where: { id: diagramId },
      });

      return deleteCount > 0;
    } catch (error) {
      console.error('Error deleting diagram:', error);
      return false;
    }
  }

  /**
   * Create a collaboration relationship between a user and a diagram
   * Prevents duplicate collaborations and validates both user and diagram existence
   * @param diagramId - ID of the diagram to collaborate on
   * @param userId - ID of the user to add as collaborator
   * @returns Promise<boolean> - true if relationship was created or already exists, false on error
   */
  async createCollaboratorRelationship(
      diagramId: string,
      userId: string,
  ): Promise<boolean> {
    try {
      // Validate user existence
      const user = await this.userModel.findOne({
        where: { id: userId },
      });

      if (!user) {
        console.error(`User with id ${userId} not found`);
        return false;
      }

      // Validate diagram existence
      const diagram = await this.diagramModel.findOne({
        where: { id: diagramId },
      });

      if (!diagram) {
        console.error(`Diagram with id ${diagramId} not found`);
        return false;
      }

      // Check if collaboration relationship already exists
      const existingRelations = await user.findRelationships({
        alias: 'CollaboratingDiagrams',
      });

      const alreadyCollaborating = existingRelations.some(
          (rel) => rel.target.getDataValues().id === diagramId,
      );

      if (alreadyCollaborating) {
        console.log(
            `User ${userId} is already collaborating on diagram ${diagramId}`,
        );
        return true;
      }

      // Create new collaboration relationship
      await user.relateTo({
        alias: 'CollaboratingDiagrams',
        where: { id: diagramId },
      });

      return true;
    } catch (error) {
      console.error('Error creating collaborator relationship:', error);
      return false;
    }
  }
}