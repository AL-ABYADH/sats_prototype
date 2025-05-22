import {
  ModelFactory as OriginalModelFactory,
  NeogmaModel,
  Neo4jSupportedProperties,
  RelationshipsI,
  Neogma,
  WhereParamsI
} from 'neogma';

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

/**
 * Generic object type for flexible typing
 */
type AnyObject = Record<string, any>;

/**
 * Enhanced schema field definition with additional metadata
 */
interface EnhancedSchemaField {
  type: string;
  required: boolean;
  [key: string]: any;
}

/**
 * Enhanced schema type that maps properties to enhanced field definitions
 */
type EnhancedSchemaType<Properties extends Neo4jSupportedProperties> = {
  [K in keyof Properties]: EnhancedSchemaField;
};

/**
 * Enhanced relationships interface with string model references
 * Allows referencing models by string name before they're defined
 */
type EnhancedRelationshipsI<RelatedNodesToAssociateI extends AnyObject> = {
  [alias in keyof RelatedNodesToAssociateI]: {
    model: string | NeogmaModel<any, any, any, any> | 'self';
    name: string;
    direction: 'out' | 'in' | 'none';
    properties?: RelationshipsI<RelatedNodesToAssociateI>[alias]['properties'];
  };
};

/**
 * Options for querying relationships with filtering capabilities
 */
interface RelationshipQueryOptions {
  where?: {
    source?: WhereParamsI;
    target?: WhereParamsI;
    relationship?: WhereParamsI;
  };
  limit?: number;
  session?: any;
}

/**
 * Options for fetching relations with include/exclude filters
 */
interface FetchRelationsOptions {
  include?: string[];
  exclude?: string[];
  limits?: Record<string, number>;
  session?: any;
}

/**
 * Options for finding entities with their relationships
 */
interface FindWithRelationsOptions {
  where?: WhereParamsI;
  limit?: number;
  skip?: number;
  order?: Array<[string, 'ASC' | 'DESC']>;
  session?: any;
  throwIfNotFound?: boolean;
  throwIfNoneFound?: boolean;
  plain?: boolean;
}

// =============================================================================
// ENHANCED MODEL REGISTRY
// =============================================================================

/**
 * Singleton registry for managing Neogma models and their relationships
 * Handles circular dependencies by deferring relationship resolution
 */
class ModelRegistry {
  private static instance: ModelRegistry;
  private models: Map<string, NeogmaModel<any, any, any, any>> = new Map();
  private pendingRelationships: Map<string, () => void> = new Map();

  /**
   * Get the singleton instance of ModelRegistry
   */
  static getInstance(): ModelRegistry {
    if (!ModelRegistry.instance) {
      ModelRegistry.instance = new ModelRegistry();
    }
    return ModelRegistry.instance;
  }

  /**
   * Register a model in the registry and process any pending relationships
   * @param name - Model name identifier
   * @param model - Neogma model instance
   */
  register(name: string, model: NeogmaModel<any, any, any, any>): void {
    this.models.set(name, model);
    this.processPendingRelationships();
  }

  /**
   * Retrieve a model by name
   * @param name - Model name identifier
   * @returns Model instance or null if not found
   */
  get(name: string): NeogmaModel<any, any, any, any> | null {
    return this.models.get(name) || null;
  }

  /**
   * Check if a model exists in the registry
   * @param name - Model name identifier
   * @returns true if model exists, false otherwise
   */
  has(name: string): boolean {
    return this.models.has(name);
  }

  /**
   * Add a pending relationship resolver for circular dependencies
   * @param modelName - Model name that has pending relationships
   * @param resolver - Function to resolve relationships when dependencies are ready
   */
  addPendingRelationship(modelName: string, resolver: () => void): void {
    this.pendingRelationships.set(modelName, resolver);
  }

  /**
   * Process all pending relationship resolvers
   * Attempts to resolve circular dependencies when models become available
   */
  private processPendingRelationships(): void {
    const resolved: string[] = [];

    for (const [modelName, resolver] of this.pendingRelationships) {
      try {
        resolver();
        resolved.push(modelName);
      } catch (error) {
        // Will retry later when more models are registered
      }
    }

    // Remove successfully resolved relationships
    resolved.forEach(modelName => {
      this.pendingRelationships.delete(modelName);
    });
  }
}

// =============================================================================
// RELATIONS FETCHER
// =============================================================================

/**
 * Utility class for fetching and managing model relationships
 * Provides advanced querying capabilities for related data
 */
class RelationsFetcher {
  private model: any;
  private neogma: Neogma;

  /**
   * Initialize RelationsFetcher with model and Neogma instance
   * @param model - Neogma model instance
   * @param neogma - Neogma database connection
   */
  constructor(model: any, neogma: Neogma) {
    this.model = model;
    this.neogma = neogma;
  }

  /**
   * Extract relationship information from model definition
   * @returns Array of relationship aliases and their cardinality
   */
  private extractRelations(): Array<{ alias: string; isArray: boolean }> {
    const relationships = this.model.relationships || {};
    const relations: Array<{ alias: string; isArray: boolean }> = [];

    for (const [alias] of Object.entries(relationships)) {
      const isArray = this.determineIfArray(alias);
      relations.push({ alias, isArray });
    }

    return relations;
  }

  /**
   * Determine if a relationship should return an array or single object
   * Based on common naming conventions for singular vs plural relationships
   * @param alias - Relationship alias name
   * @returns true if relationship should return array, false for single object
   */
  private determineIfArray(alias: string): boolean {
    const singleRelations = ['company', 'profile', 'manager', 'parent', 'owner', 'creator', 'author', 'user', 'account'];
    const aliasLower = alias.toLowerCase();
    return !singleRelations.some(single => aliasLower.includes(single));
  }

  /**
   * Find a single entity with all its relationships loaded
   * @param where - Query conditions for finding the entity
   * @param options - Query and relation fetching options
   * @returns Entity with loaded relationships or null if not found
   */
  async findOneWithRelations(where: WhereParamsI, options: FindWithRelationsOptions & FetchRelationsOptions = {}): Promise<any> {
    const entity = await this.model.findOne({
      where,
      throwIfNotFound: options.throwIfNotFound || false,
      session: options.session,
      order: options.order,
      plain: options.plain
    });

    if (!entity) return null;

    return await this.loadRelations(entity, options);
  }

  /**
   * Find multiple entities with all their relationships loaded
   * @param where - Query conditions for finding entities
   * @param options - Query and relation fetching options
   * @returns Array of entities with loaded relationships
   */
  async findManyWithRelations(where: WhereParamsI = {}, options: FindWithRelationsOptions & FetchRelationsOptions = {}): Promise<any[]> {
    const entities = await this.model.findMany({
      where,
      limit: options.limit,
      skip: options.skip,
      order: options.order,
      throwIfNoneFound: options.throwIfNoneFound || false,
      session: options.session,
      plain: options.plain
    });

    if (entities.length === 0) return [];

    // Load relationships for all entities in parallel
    const results = await Promise.all(
        entities.map(entity => this.loadRelations(entity, options))
    );

    return results;
  }

  /**
   * Load relationships for a given entity with filtering options
   * @param entity - Entity to load relationships for
   * @param options - Options for filtering and limiting relationships
   * @returns Entity data with loaded relationships
   */
  async loadRelations(entity: any, options: FetchRelationsOptions = {}): Promise<any> {
    let relations = this.extractRelations();

    // Apply include filter - only load specified relationships
    if (options.include?.length) {
      relations = relations.filter(rel => options.include!.includes(rel.alias));
    }

    // Apply exclude filter - skip specified relationships
    if (options.exclude?.length) {
      relations = relations.filter(rel => !options.exclude!.includes(rel.alias));
    }

    const result = entity.getDataValues ? entity.getDataValues() : entity;

    // Load all relationships in parallel
    const relationPromises = relations.map(async (relation) => {
      try {
        const relationOptions: any = {
          alias: relation.alias,
          session: options.session
        };

        // Apply per-relationship limits if specified
        if (options.limits?.[relation.alias]) {
          relationOptions.limit = options.limits[relation.alias];
        }

        const relationships = await entity.findRelationships(relationOptions);

        // Process relationship data and include relationship properties if present
        const processedData = relationships.map((rel: any) => {
          const targetData = rel.target.getDataValues ? rel.target.getDataValues() : rel.target;
          if (rel.relationship && Object.keys(rel.relationship).length > 0) {
            targetData._relationshipProperties = rel.relationship;
          }
          return targetData;
        });

        return {
          alias: relation.alias,
          data: relation.isArray ? processedData : (processedData[0] || null)
        };
      } catch (error) {
        // Return empty data on error, don't fail the entire operation
        return {
          alias: relation.alias,
          data: relation.isArray ? [] : null
        };
      }
    });

    const relationResults = await Promise.all(relationPromises);

    // Attach relationship data to result object
    relationResults.forEach(({ alias, data }) => {
      result[alias] = data;
    });

    return result;
  }

  /**
   * Search within relationships of entities matching criteria
   * @param where - Conditions for finding source entities
   * @param relationAlias - Name of the relationship to search in
   * @param searchOptions - Options for filtering relationship search
   * @returns Array of related entities matching search criteria
   */
  async searchInRelations(where: WhereParamsI, relationAlias: string, searchOptions: RelationshipQueryOptions = {}): Promise<any[]> {
    const entities = await this.model.findMany({ where, session: searchOptions.session });
    if (entities.length === 0) return [];

    const allResults: any[] = [];

    for (const entity of entities) {
      try {
        const relationships = await entity.findRelationships({
          alias: relationAlias,
          where: searchOptions.where,
          limit: searchOptions.limit,
          session: searchOptions.session
        });

        const results = relationships.map((rel: any) => {
          const targetData = rel.target.getDataValues ? rel.target.getDataValues() : rel.target;
          if (rel.relationship && Object.keys(rel.relationship).length > 0) {
            targetData._relationshipProperties = rel.relationship;
          }
          return targetData;
        });

        allResults.push(...results);
      } catch (error) {
        console.warn(`Failed to search in relation ${relationAlias}:`, (error as Error).message);
      }
    }

    return allResults;
  }

  /**
   * Create multiple relationships in batch for entities matching criteria
   * @param sourceWhere - Conditions for finding source entities
   * @param relations - Array of relationship definitions to create
   * @param options - Session and validation options
   * @returns Result summary with success status, created count, and errors
   */
  async createMultipleRelations(
      sourceWhere: WhereParamsI,
      relations: Array<{
        alias: string;
        targetWhere: WhereParamsI | WhereParamsI[];
        properties?: any;
      }>,
      options: { session?: any; assertCreatedRelationships?: number } = {}
  ): Promise<{ success: boolean; created: number; errors: string[] }> {
    const entities = await this.model.findMany({
      where: sourceWhere,
      session: options.session
    });

    if (entities.length === 0) {
      return { success: false, created: 0, errors: ['No source entities found'] };
    }

    let totalCreated = 0;
    const errors: string[] = [];

    // Create relationships for each source entity
    for (const entity of entities) {
      for (const relation of relations) {
        const targetWheres = Array.isArray(relation.targetWhere) ? relation.targetWhere : [relation.targetWhere];

        for (const targetWhere of targetWheres) {
          try {
            const relationParams: any = {
              alias: relation.alias,
              where: targetWhere,
              session: options.session
            };

            if (relation.properties) {
              relationParams.properties = relation.properties;
            }

            await entity.relateTo(relationParams);
            totalCreated++;
          } catch (error) {
            errors.push(`Failed to create relation ${relation.alias}: ${(error as Error).message}`);
          }
        }
      }
    }

    const success = errors.length === 0;

    // Validate expected relationship count if specified
    if (options.assertCreatedRelationships && totalCreated !== options.assertCreatedRelationships) {
      errors.push(`Expected ${options.assertCreatedRelationships} relations, created ${totalCreated}`);
      return { success: false, created: totalCreated, errors };
    }

    return { success, created: totalCreated, errors };
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Resolve string-based model references to actual model instances
 * Handles circular dependencies by looking up models in the registry
 * @param relationships - Enhanced relationships with string model references
 * @param modelName - Name of the model being processed
 * @returns Resolved relationships with actual model instances
 */
function resolveRelationships<RelatedNodesToAssociateI extends AnyObject>(
    relationships: Partial<EnhancedRelationshipsI<RelatedNodesToAssociateI>> | undefined,
    modelName: string
): Partial<RelationshipsI<RelatedNodesToAssociateI>> {
  if (!relationships) return {};

  const registry = ModelRegistry.getInstance();
  const resolvedRelationships: Partial<RelationshipsI<RelatedNodesToAssociateI>> = {};

  for (const [alias, relationship] of Object.entries(relationships)) {
    if (!relationship) continue;

    let resolvedModel: NeogmaModel<any, any, any, any> | 'self';

    if (typeof relationship.model === 'string') {
      if (relationship.model === 'self') {
        resolvedModel = 'self';
      } else {
        const foundModel = registry.get(relationship.model);
        if (!foundModel) {
          throw new Error(`Model "${relationship.model}" not found. Make sure it's defined before use.`);
        }
        resolvedModel = foundModel;
      }
    } else {
      resolvedModel = relationship.model;
    }

    resolvedRelationships[alias as keyof RelatedNodesToAssociateI] = {
      model: resolvedModel,
      name: relationship.name,
      direction: relationship.direction,
      properties: relationship.properties
    } as RelationshipsI<RelatedNodesToAssociateI>[keyof RelatedNodesToAssociateI];
  }

  return resolvedRelationships;
}

/**
 * Convert enhanced schema to Neogma-compatible schema format
 * @param schema - Enhanced schema with additional metadata
 * @returns Schema in Neogma's expected format
 */
function convertSchema<Properties extends Neo4jSupportedProperties>(
    schema: EnhancedSchemaType<Properties>
): any {
  return schema as any;
}

// =============================================================================
// ENHANCED MODEL FACTORY
// =============================================================================

/**
 * Enhanced model factory that extends Neogma's capabilities
 * Provides relationship management, circular dependency resolution, and advanced querying
 *
 * Features:
 * - String-based model references for circular dependencies
 * - Automatic relationship loading with filtering
 * - Batch relationship creation
 * - Advanced search within relationships
 * - Model registry for dependency management
 *
 * @param parameters - Model configuration including schema, relationships, and metadata
 * @param neogma - Neogma database connection instance
 * @returns Enhanced Neogma model with additional methods
 */
export function ModelFactory<
    Properties extends Neo4jSupportedProperties,
    RelatedNodesToAssociateI extends AnyObject = AnyObject,
    StaticsI extends AnyObject = AnyObject,
    MethodsI extends AnyObject = AnyObject,
>(
    parameters: {
      name: string;
      schema: EnhancedSchemaType<Properties>;
      label: string;
      statics?: Partial<StaticsI>;
      methods?: Partial<MethodsI>;
      primaryKeyField?: Extract<keyof Properties, string>;
      relationships?: Partial<EnhancedRelationshipsI<RelatedNodesToAssociateI>>;
    },
    neogma: Neogma
): NeogmaModel<Properties, RelatedNodesToAssociateI, MethodsI, StaticsI> {

  const registry = ModelRegistry.getInstance();
  const { name: modelName, relationships: enhancedRelationships, schema, ...restParams } = parameters;

  let model: NeogmaModel<Properties, RelatedNodesToAssociateI, MethodsI, StaticsI>;

  try {
    // Attempt to create model with all relationships resolved
    const convertedSchema = convertSchema(schema);
    const resolvedRelationships = resolveRelationships(enhancedRelationships, modelName);

    const originalModelParams = {
      schema: convertedSchema,
      relationships: resolvedRelationships,
      ...restParams
    };

    model = OriginalModelFactory<Properties, RelatedNodesToAssociateI, StaticsI, MethodsI>(
        originalModelParams,
        neogma
    );

    // Add enhanced methods for relationship management
    const fetcher = new RelationsFetcher(model, neogma);
    addEnhancedMethods(model, fetcher);

    registry.register(modelName, model);

  } catch (error) {
    // Handle circular dependencies by creating model without relationships first
    const convertedSchema = convertSchema(schema);
    const originalModelParams = {
      schema: convertedSchema,
      relationships: {},
      ...restParams
    };

    model = OriginalModelFactory<Properties, RelatedNodesToAssociateI, StaticsI, MethodsI>(
        originalModelParams,
        neogma
    );

    // Add enhanced methods
    const fetcher = new RelationsFetcher(model, neogma);
    addEnhancedMethods(model, fetcher);

    registry.register(modelName, model);

    // Schedule relationship resolution for later
    if (enhancedRelationships) {
      registry.addPendingRelationship(modelName, () => {
        const resolvedRelationships = resolveRelationships(enhancedRelationships, modelName);
        model.addRelationships(resolvedRelationships);
      });
    }
  }

  return model;
}

/**
 * Add enhanced methods to a Neogma model for advanced relationship management
 * @param model - Neogma model to enhance
 * @param fetcher - RelationsFetcher instance for the model
 */
function addEnhancedMethods(model: any, fetcher: RelationsFetcher): void {
  // Static methods for model-level operations

  /**
   * Find a single entity with all relationships loaded
   */
  model.findOneWithRelations = async (where: WhereParamsI, options?: FindWithRelationsOptions & FetchRelationsOptions) => {
    return fetcher.findOneWithRelations(where, options);
  };

  /**
   * Find multiple entities with all relationships loaded
   */
  model.findManyWithRelations = async (where?: WhereParamsI, options?: FindWithRelationsOptions & FetchRelationsOptions) => {
    return fetcher.findManyWithRelations(where, options);
  };

  /**
   * Search within relationships of entities
   */
  model.searchInRelations = async (where: WhereParamsI, relationAlias: string, searchOptions?: RelationshipQueryOptions) => {
    return fetcher.searchInRelations(where, relationAlias, searchOptions);
  };

  /**
   * Create multiple relationships in batch
   */
  model.createMultipleRelations = async (
      sourceWhere: WhereParamsI,
      relations: Array<{
        alias: string;
        targetWhere: WhereParamsI | WhereParamsI[];
        properties?: any;
      }>,
      options?: { session?: any; assertCreatedRelationships?: number }
  ) => {
    return fetcher.createMultipleRelations(sourceWhere, relations, options);
  };

  // Instance methods for individual entity operations

  /**
   * Load relationships for this entity instance
   */
  model.prototype.loadRelations = async function(options?: FetchRelationsOptions) {
    return fetcher.loadRelations(this, options);
  };

  /**
   * Create multiple relationships from this entity instance
   */
  model.prototype.createMultipleRelations = async function(
      relations: Array<{
        alias: string;
        targetWhere: WhereParamsI | WhereParamsI[];
        properties?: any;
      }>,
      options?: { session?: any; assertCreatedRelationships?: number }
  ) {
    const primaryKey = model.getPrimaryKeyField();
    if (!primaryKey) {
      throw new Error('Primary key field is required for instance methods');
    }
    const sourceWhere = { [primaryKey]: this[primaryKey] };
    return fetcher.createMultipleRelations(sourceWhere, relations, options);
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export type {
  EnhancedRelationshipsI,
  EnhancedSchemaType,
  FetchRelationsOptions,
  FindWithRelationsOptions,
  RelationshipQueryOptions
};

// Re-export Neogma types for convenience
export {
  NeogmaInstance,
  ModelRelatedNodesI,
  Op,
  UpdateOp,
  Literal,
  NeogmaModel,
  Neo4jSupportedProperties
} from 'neogma';