import {
  ModelFactory as OriginalModelFactory,
  Neo4jSupportedProperties,
  Neogma,
  NeogmaModel,
  RelationshipsI,
  WhereParamsI,
} from 'neogma';

// =============================================================================
// TYPES & INTERFACES
// =============================================================================
type NeogmaSchema<Properties> = {
  [K in keyof Properties]: any;
};
/**
 * Enhanced relationship definition with cardinality info
 */
type EnhancedRelationshipsI<RelatedNodes extends Record<string, any>> = {
  [alias in keyof RelatedNodes]: {
    model: string | NeogmaModel<any, any, any, any> | 'self';
    name: string;
    direction: 'out' | 'in' | 'none';
    properties?: RelationshipsI<RelatedNodes>[alias]['properties'];
    cardinality?: 'one' | 'many'; // NEW: Explicit cardinality definition
  };
};

/**
 * Options for fetching relationships
 */
interface FetchRelationsOptions {
  include?: string[];
  exclude?: string[];
  limits?: Record<string, number>;
  session?: any;
}

/**
 * Options for finding entities with relationships
 */
interface FindWithRelationsOptions extends FetchRelationsOptions {
  where?: WhereParamsI;
  limit?: number;
  skip?: number;
  order?: Array<[string, 'ASC' | 'DESC']>;
  throwIfNotFound?: boolean;
  throwIfNoneFound?: boolean;
  plain?: boolean;
}

/**
 * Enhanced model interface - only available when using our ModelFactory
 */
// بدلاً من extends، استخدم intersection type
type EnhancedNeogmaModel<
    Properties extends Neo4jSupportedProperties,
    RelatedNodes extends Record<string, any>,
    Methods extends Record<string, any>,
    Statics extends Record<string, any>
> = NeogmaModel<Properties, RelatedNodes, Methods, Statics> & {
  // Static methods
  findOneWithRelations(
      where: WhereParamsI,
      options?: FindWithRelationsOptions
  ): Promise<Properties & Partial<RelatedNodes>>;

  findManyWithRelations(
      where?: WhereParamsI,
      options?: FindWithRelationsOptions
  ): Promise<Array<Properties & Partial<RelatedNodes>>>;

  searchInRelations(
      where: WhereParamsI,
      relationAlias: keyof RelatedNodes,
      searchOptions?: {
        where?: { source?: WhereParamsI; target?: WhereParamsI; relationship?: WhereParamsI };
        limit?: number;
        session?: any;
      }
  ): Promise<any[]>;

  createMultipleRelations(
      sourceWhere: WhereParamsI,
      relations: Array<{
        alias: keyof RelatedNodes;
        targetWhere: WhereParamsI | WhereParamsI[];
        properties?: any;
      }>,
      options?: { session?: any; assertCreatedRelationships?: number }
  ): Promise<{ success: boolean; created: number; errors: string[] }>;


  findByLabel(
      label: string,
      where?: WhereParamsI,
      options?: FindWithRelationsOptions
  ): Promise<Array<Properties & Partial<RelatedNodes>>>;

  findByLabels(
      labels: string[],
      where?: WhereParamsI,
      options?: FindWithRelationsOptions
  ): Promise<Array<Properties & Partial<RelatedNodes>>>;

  getLabels(): string[];
};
// =============================================================================
// MODEL REGISTRY
// =============================================================================

/**
 * Simple registry for managing models and resolving circular dependencies
 */
class ModelRegistry {
  private static instance: ModelRegistry;
  private models = new Map<string, NeogmaModel<any, any, any, any>>();
  private pendingRelationships = new Map<string, () => void>();

  static getInstance(): ModelRegistry {
    if (!ModelRegistry.instance) {
      ModelRegistry.instance = new ModelRegistry();
    }
    return ModelRegistry.instance;
  }

  register(name: string, model: NeogmaModel<any, any, any, any>): void {
    this.models.set(name, model);
    this.processPendingRelationships();
  }

  get(name: string): NeogmaModel<any, any, any, any> | null {
    return this.models.get(name) || null;
  }

  addPendingRelationship(modelName: string, resolver: () => void): void {
    this.pendingRelationships.set(modelName, resolver);
  }

  private processPendingRelationships(): void {
    const resolved: string[] = [];

    for (const [modelName, resolver] of this.pendingRelationships) {
      try {
        resolver();
        resolved.push(modelName);
      } catch {
        // Will retry when more models are registered
      }
    }

    resolved.forEach(name => this.pendingRelationships.delete(name));
  }
}

// =============================================================================
// RELATIONSHIP UTILITIES
// =============================================================================

/**
 * Helper class for managing relationships
 */
class RelationshipManager {
  constructor(
      private model: any,
      private neogma: Neogma,
      private relationshipDefinitions: Record<string, { cardinality?: 'one' | 'many' }>
  ) {
  }

  /**
   * Load relationships for an entity
   */
  async loadRelations(entity: any, options: FetchRelationsOptions = {}): Promise<any> {
    const relationships = this.model.relationships || {};
    let relationAliases = Object.keys(relationships);

    // Apply filters
    if (options.include?.length) {
      relationAliases = relationAliases.filter(alias => options.include!.includes(alias));
    }
    if (options.exclude?.length) {
      relationAliases = relationAliases.filter(alias => !options.exclude!.includes(alias));
    }

    const result = entity.getDataValues ? entity.getDataValues() : {...entity};

    // Load relationships in parallel
    const loadPromises = relationAliases.map(async (alias) => {
      try {
        const {isArray} = this.getRelationInfo(alias);
        const relationOptions: any = {
          alias,
          session: options.session
        };

        if (options.limits?.[alias]) {
          relationOptions.limit = options.limits[alias];
        }

        const relationships = await entity.findRelationships(relationOptions);

        const data = relationships.map((rel: any) => {
          const targetData = rel.target.getDataValues ? rel.target.getDataValues() : rel.target;
          if (rel.relationship && Object.keys(rel.relationship).length > 0) {
            targetData._relationshipProperties = rel.relationship;
          }
          return targetData;
        });

        return {alias, data: isArray ? data : (data[0] || null)};
      } catch {
        const {isArray} = this.getRelationInfo(alias);
        return {alias, data: isArray ? [] : null};
      }
    });

    const results = await Promise.all(loadPromises);
    results.forEach(({alias, data}) => {
      result[alias] = data;
    });

    return result;
  }

  /**
   * Find one entity with relationships
   */
  async findOneWithRelations(where: WhereParamsI, options: FindWithRelationsOptions = {}): Promise<any> {
    const entity = await this.model.findOne({
      where,
      session: options.session,
      order: options.order,
      plain: options.plain,
      throwIfNotFound: options.throwIfNotFound || false
    });

    if (!entity) return null;

    return this.loadRelations(entity, options);
  }

  /**
   * Find many entities with relationships
   */
  async findManyWithRelations(where: WhereParamsI = {}, options: FindWithRelationsOptions = {}): Promise<any[]> {
    const entities = await this.model.findMany({
      where,
      limit: options.limit,
      skip: options.skip,
      order: options.order,
      session: options.session,
      plain: options.plain,
      throwIfNoneFound: options.throwIfNoneFound || false
    });

    if (!entities.length) return [];

    return Promise.all(entities.map(entity => this.loadRelations(entity, options)));
  }

  /**
   * Search within relationships
   */
  async searchInRelations(
      where: WhereParamsI,
      relationAlias: string,
      searchOptions: any = {}
  ): Promise<any[]> {
    const entities = await this.model.findMany({ where, session: searchOptions.session });
    if (!entities.length) return [];

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
      } catch {
        // Skip failed searches
      }
    }

    return allResults;
  }

  /**
   * Create multiple relationships
   */
  async createMultipleRelations(
      sourceWhere: WhereParamsI,
      relations: any[],
      options: any = {}
  ): Promise<{ success: boolean; created: number; errors: string[] }> {
    const entities = await this.model.findMany({
      where: sourceWhere,
      session: options.session
    });

    if (!entities.length) {
      return { success: false, created: 0, errors: ['No source entities found'] };
    }

    let created = 0;
    const errors: string[] = [];

    for (const entity of entities) {
      for (const relation of relations) {
        const targetWheres = Array.isArray(relation.targetWhere)
            ? relation.targetWhere
            : [relation.targetWhere];

        for (const targetWhere of targetWheres) {
          try {
            await entity.relateTo({
              alias: relation.alias,
              where: targetWhere,
              properties: relation.properties,
              session: options.session
            });
            created++;
          } catch (error: any) {
            errors.push(`Failed to create relation ${relation.alias}: ${error.message}`);
          }
        }
      }
    }

    if (options.assertCreatedRelationships && created !== options.assertCreatedRelationships) {
      errors.push(`Expected ${options.assertCreatedRelationships} relations, created ${created}`);
      return {success: false, created, errors};
    }

    return {success: errors.length === 0, created, errors};
  }

  /**
   * Get relationship information with cardinality
   */
  private getRelationInfo(alias: string): { isArray: boolean } {
    const definition = this.relationshipDefinitions[alias];

    // Use explicit cardinality if defined
    if (definition?.cardinality) {
      return {isArray: definition.cardinality === 'many'};
    }

    // Default to 'many' for safety - can be overridden by cardinality
    return {isArray: true};
  }
}

// =============================================================================
// ENHANCED MODEL FACTORY
// =============================================================================

/**
 * Enhanced Model Factory with relationship management
 *
 * @example
 * const User = ModelFactory({
 *   name: 'User',
 *   label: 'User',
 *   schema: {
 *     id: { type: 'string', required: true },
 *     name: { type: 'string', required: true }
 *   },
 *   relationships: {
 *     profile: {
 *       model: 'Profile',
 *       direction: 'out',
 *       name: 'HAS_PROFILE',
 *       cardinality: 'one'  // Explicit: returns single object
 *     },
 *     posts: {
 *       model: 'Post',
 *       direction: 'out',
 *       name: 'AUTHORED',
 *       cardinality: 'many' // Explicit: returns array
 *     }
 *   }
 * }, neogmaInstance);
 *
 * // Usage
 * const userWithRelations = await User.findOneWithRelations(
 *   { id: '123' },
 *   { include: ['profile', 'posts'], limits: { posts: 5 } }
 * );
 */
export function ModelFactory<
    Properties extends Neo4jSupportedProperties,
    RelatedNodes extends Record<string, any> = Record<string, any>,
    Statics extends Record<string, any> = Record<string, any>,
    Methods extends Record<string, any> = Record<string, any>
>(
    parameters: {
      name: string;
      schema: NeogmaSchema<Properties>;
      label: string | string[];
      statics?: Partial<Statics>;
      methods?: Partial<Methods>;
      primaryKeyField?: Extract<keyof Properties, string>;
      relationships?: Partial<EnhancedRelationshipsI<RelatedNodes>>;
    },
    neogma: Neogma
): EnhancedNeogmaModel<Properties, RelatedNodes, Methods, Statics> {

  const registry = ModelRegistry.getInstance();
  const {name: modelName, relationships: enhancedRelationships, ...restParams} = parameters;

  // Store relationship definitions for cardinality info
  const relationshipDefinitions: Record<string, { cardinality?: 'one' | 'many' }> = {};
  if (enhancedRelationships) {
    Object.entries(enhancedRelationships).forEach(([alias, rel]) => {
      if (rel) {
        relationshipDefinitions[alias] = {cardinality: rel.cardinality};
      }
    });
  }

  // Resolve relationships
  const resolveRelationships = (): Partial<RelationshipsI<RelatedNodes>> => {
    if (!enhancedRelationships) return {};

    const resolved: Partial<RelationshipsI<RelatedNodes>> = {};

    for (const [alias, rel] of Object.entries(enhancedRelationships)) {
      if (!rel) continue;

      let model: NeogmaModel<any, any, any, any> | 'self';

      if (typeof rel.model === 'string') {
        if (rel.model === 'self') {
          model = 'self';
        } else {
          const found = registry.get(rel.model);
          if (!found) {
            throw new Error(`Model "${rel.model}" not found`);
          }
          model = found;
        }
      } else {
        model = rel.model;
      }

      resolved[alias as keyof RelatedNodes] = {
        model,
        name: rel.name,
        direction: rel.direction,
        properties: rel.properties
      } as any;
    }

    return resolved;
  };

  let model: EnhancedNeogmaModel<Properties, RelatedNodes, Methods, Statics>;

  try {
    // Try to create with resolved relationships
    const relationships = resolveRelationships();
    model = OriginalModelFactory({
      ...restParams,
      relationships
    }, neogma) as any;

  } catch {
    // Create without relationships first (circular dependency)
    model = OriginalModelFactory({
      ...restParams,
      relationships: {}
    }, neogma) as any;

    // Schedule relationship resolution
    if (enhancedRelationships) {
      registry.addPendingRelationship(modelName, () => {
        const relationships = resolveRelationships();
        (model as any).addRelationships(relationships);
      });
    }
  }

  // Add enhanced methods
  const manager = new RelationshipManager(model, neogma, relationshipDefinitions);


  // حفظ الـ labels
  const modelLabels = Array.isArray(parameters.label) ? parameters.label : [parameters.label];

  (model as any).getLabels = () => modelLabels;

  (model as any).findByLabel = async (
      label: string,
      where?: WhereParamsI,
      options?: FindWithRelationsOptions
  ) => {
    const query = `
    MATCH (n:${label})
    ${where ? 'WHERE ' + Object.entries(where).map(([key, value]) =>
        `n.${key} = $${key}`
    ).join(' AND ') : ''}
    RETURN n
    ${options?.limit ? `LIMIT ${options.limit}` : ''}
    ${options?.skip ? `SKIP ${options.skip}` : ''}
  `;

    const result = await neogma.queryRunner.run(query, where || {});
    const entities = result.records.map(record => record.get('n').properties);

    if (options?.include || options?.exclude) {
      return Promise.all(
          entities.map(entity => manager.loadRelations(entity, options))
      );
    }

    return entities;
  };

// إضافة دالة البحث بـ labels متعددة
  (model as any).findByLabels = async (
      labels: string[],
      where?: WhereParamsI,
      options?: FindWithRelationsOptions
  ) => {
    const labelQuery = labels.map(l => `:${l}`).join('');
    const query = `
    MATCH (n${labelQuery})
    ${where ? 'WHERE ' + Object.entries(where).map(([key, value]) =>
        `n.${key} = $${key}`
    ).join(' AND ') : ''}
    RETURN n
    ${options?.limit ? `LIMIT ${options.limit}` : ''}
    ${options?.skip ? `SKIP ${options.skip}` : ''}
  `;

    const result2 = await neogma.queryRunner.run(query, where || {});
    const entities = result2.records.map(record => record.get('n').properties);

    if (options?.include || options?.exclude) {
      return Promise.all(
          entities.map(entity => manager.loadRelations(entity, options))
      );
    }

    return entities;
  };

  // Static methods
  (model as any).findOneWithRelations = (where: WhereParamsI, options?: FindWithRelationsOptions) =>
      manager.findOneWithRelations(where, options);

  (model as any).findManyWithRelations = (where?: WhereParamsI, options?: FindWithRelationsOptions) =>
      manager.findManyWithRelations(where || {}, options);

  (model as any).searchInRelations = (where: WhereParamsI, relationAlias: string, searchOptions?: any) =>
      manager.searchInRelations(where, relationAlias, searchOptions);

  (model as any).createMultipleRelations = (sourceWhere: WhereParamsI, relations: any[], options?: any) =>
      manager.createMultipleRelations(sourceWhere, relations, options);

  // Instance methods
  (model as any).prototype.loadRelations = function (options?: FetchRelationsOptions) {
    return manager.loadRelations(this, options);
  };

  (model as any).prototype.createMultipleRelations = function (relations: any[], options?: any) {
    const primaryKey = (model as any).getPrimaryKeyField();
    if (!primaryKey) {
      throw new Error('Primary key field is required');
    }
    const where = {[primaryKey]: this[primaryKey]};
    return manager.createMultipleRelations(where, relations, options);
  };

  // Register model
  registry.register(modelName, model as any);

  return model;
}
