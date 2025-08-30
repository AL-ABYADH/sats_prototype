import { Inject, Injectable } from '@nestjs/common';
import { User } from '../entities/user.entity';
import { UserModel } from '../models/user.model';
import { v4 as uuidv4 } from 'uuid';
import { Neogma } from 'neogma';
import { InjectNeogma } from '../../../utility/neogma_provider';

/**
 * Repository class for handling User data operations with Neo4j database
 * Uses Neogma OGM for database interactions
 */
@Injectable()
export class UserRepository {
  private userModel;

  /**
   * Initialize the UserRepository with Neogma instance
   * @param neogma - Neogma instance for database connectivity
   */
  constructor(@InjectNeogma() private readonly neogma: Neogma) {
    this.userModel = UserModel(neogma);
  }

  /**
   * Retrieve all users from the database
   * @returns Promise<User[]> - Array of all users or empty array on error
   */
  async list(): Promise<User[]> {
    try {
      const users = await this.userModel.findMany();
      return users.map(user => user.getDataValues() as User);
    } catch (error) {
      console.error('Error listing users:', error);
      return [];
    }
  }

  /**
   * Find a user by their email address
   * @param email - User's email address
   * @returns Promise<User | null> - User object if found, null otherwise
   */
  async findByEmail(email: string): Promise<User | null> {
    try {
      const user = await this.userModel.findOne({
        where: { email }
      });

      return user ? user.getDataValues() as User : null;
    } catch (error) {
      console.error('Error finding user by email:', error);
      return null;
    }
  }

  /**
   * Find a user by their unique ID
   * @param id - User's unique identifier
   * @returns Promise<User | null> - User object if found, null otherwise
   */
  async findById(id: string): Promise<User | null> {
    try {
      const user = await this.userModel.findOne({
        where: { id }
      });

      if (!user) {
        return null;
      }

      return user.getDataValues() as User;
    } catch (error) {
      console.error('Error finding user by id:', error);
      return null;
    }
  }

  /**
   * Create a new user in the database
   * @param user - Partial user object with required fields
   * @returns Promise<User> - Created user object
   * @throws Error if creation fails
   */
  async create(user: Partial<User>): Promise<User> {
    try {
      const newUser = await this.userModel.createOne({
        id: uuidv4(),
        name: user.name || '',
        email: user.email || '',
      });

      return newUser.getDataValues() as User;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  /**
   * Update an existing user's information
   * @param userId - ID of the user to update
   * @param updates - Partial user object containing fields to update
   * @returns Promise<User | null> - Updated user object or null if not found
   */
  async update(userId: string, updates: Partial<User>): Promise<User | null> {
    try {
      const [updatedUsers] = await this.userModel.update(updates, {
        where: { id: userId },
        return: true,
      });

      if (updatedUsers.length === 0) {
        return null;
      }

      return updatedUsers[0].getDataValues() as User;
    } catch (error) {
      console.error('Error updating user:', error);
      return null;
    }
  }

  /**
   * Delete a user from the database
   * @param userId - ID of the user to delete
   * @returns Promise<boolean> - true if deletion was successful, false otherwise
   */
  async delete(userId: string): Promise<boolean> {
    try {
      const deleteCount = await this.userModel.delete({
        detach: true,
        where: { id: userId },
      });

      return deleteCount > 0;
    } catch (error) {
      console.error('Error deleting user:', error);
      return false;
    }
  }
}