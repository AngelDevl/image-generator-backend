import {
  Collection,
  Db,
  Document,
  Filter,
  FindOptions,
  OptionalUnlessRequiredId,
  UpdateFilter,
  WithId,
  WithoutId,
} from "mongodb";

export abstract class BaseRepository
  TSchema extends Document,
  TCreate = TSchema,
> {
  protected readonly collection: Collection<TSchema>;

  constructor(db: Db, collectionName: string) {
    this.collection = db.collection<TSchema>(collectionName);
  }

  async create(item: TCreate): Promise<WithId<TSchema>> {
    const result = await this.collection.insertOne(
      item as OptionalUnlessRequiredId<TSchema>,
    );
    return { ...item, _id: result.insertedId } as unknown as WithId<TSchema>;
  }

  async getById(id: NonNullable<TSchema["_id"]>): Promise<WithId<TSchema> | null> {
    return this.collection.findOne({ _id: id } as Filter<TSchema>);
  }

  async find(filter: Filter<TSchema> = {}, options?: FindOptions<TSchema>): Promise<WithId<TSchema>[]> {
    return this.collection.find(filter, options).toArray();
  }

  async findOne(filter: Filter<TSchema>): Promise<WithId<TSchema> | null> {
    return this.collection.findOne(filter);
  }

  async update(
    id: NonNullable<TSchema["_id"]>,
    item: WithoutId<TSchema>,
  ): Promise<WithId<TSchema> | null> {
    return this.collection.findOneAndReplace(
      { _id: id } as Filter<TSchema>,
      item,
      { returnDocument: "after" },
    );
  }

  async patch(
    id: NonNullable<TSchema["_id"]>,
    fields: Partial<WithoutId<TSchema>>,
  ): Promise<WithId<TSchema> | null> {
    if (Object.keys(fields).length === 0) {
      return this.getById(id); 
    }
    return this.collection.findOneAndUpdate(
      { _id: id } as Filter<TSchema>,
      { $set: fields } as UpdateFilter<TSchema>,
      { returnDocument: "after" },
    );
  }

  async delete(id: NonNullable<TSchema["_id"]>): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: id } as Filter<TSchema>);
    return result.deletedCount > 0;
  }
}

import type { Db, Filter, UpdateFilter } from 'mongodb';
import { BaseRepository } from './base.repository.js';
import type { Soldier } from '../schemas/soldier.schema.js';

export class SoldierRepository extends BaseRepository<Soldier> {
  constructor(db: Db) {
    super(db, 'soldiers');
  }

  async pushLimitations(id: string, limitations: string[]): Promise<Soldier | null> {
    return this.collection.findOneAndUpdate(
      { _id: id } as Filter<Soldier>,
      {
        $addToSet: { limitations: { $each: limitations } },
        $set: { updatedAt: new Date() },
      } as UpdateFilter<Soldier>,
      { returnDocument: 'after' },
    );
  }
}


import type { FastifyReply, FastifyRequest } from 'fastify';
import { SoldierDuplicateIdError } from '../services/soldier.service.js';
import type {
  CreateSoldierBody,
  ListSoldiersQuery,
  PatchSoldierBody,
  PushLimitationsBody,
  SoldierIdParams,
} from '../schemas/soldier.schema.js';

export async function createSoldier(
  request: FastifyRequest<{ Body: CreateSoldierBody }>,
  reply: FastifyReply,
): Promise<void> {
  try {
    const soldier = await request.server.soldierService.createSoldier(request.body);
    reply.code(201).send(soldier);
  } catch (err) {
    if (err instanceof SoldierDuplicateIdError) {
      reply.code(409).send({ message: err.message });
      return;
    }
    throw err;
  }
}

export async function getSoldier(
  request: FastifyRequest<{ Params: SoldierIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const soldier = await request.server.soldierService.getSoldierById(request.params.id);

  if (!soldier) {
    reply.code(404).send({ message: 'Soldier not found' });
    return;
  }

  reply.code(200).send(soldier);
}

export async function listSoldiers(
  request: FastifyRequest<{ Querystring: ListSoldiersQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const soldiers = await request.server.soldierService.listSoldiers(request.query);
  reply.code(200).send(soldiers);
}

export async function deleteSoldier(
  request: FastifyRequest<{ Params: SoldierIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const deleted = await request.server.soldierService.deleteSoldier(request.params.id);

  if (!deleted) {
    reply.code(404).send({ message: 'Soldier not found' });
    return;
  }

  reply.code(204).send();
}

export async function patchSoldier(
  request: FastifyRequest<{ Params: SoldierIdParams; Body: PatchSoldierBody }>,
  reply: FastifyReply,
): Promise<void> {
  const soldier = await request.server.soldierService.patchSoldier(
    request.params.id,
    request.body,
  );

  if (!soldier) {
    reply.code(404).send({ message: 'Soldier not found' });
    return;
  }

  reply.code(200).send(soldier);
}

export async function pushLimitations(
  request: FastifyRequest<{ Params: SoldierIdParams; Body: PushLimitationsBody }>,
  reply: FastifyReply,
): Promise<void> {
  const soldier = await request.server.soldierService.pushLimitations(
    request.params.id,
    request.body,
  );

  if (!soldier) {
    reply.code(404).send({ message: 'Soldier not found' });
    return;
  }

  reply.code(200).send(soldier);
}


import type { Filter } from 'mongodb';
import type { SoldierRepository } from '../repositories/soldier.repository.js';
import {
  rankNameToValue,
  rankValueToName,
  type CreateSoldierBody,
  type ListSoldiersQuery,
  type PatchSoldierBody,
  type RankName,
  type Soldier,
} from '../schemas/soldier.schema.js';

export class SoldierDuplicateIdError extends Error {
  constructor(public readonly id: string) {
    super(`Soldier with id ${id} already exists`);
  }
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 11000;
}

function resolveRank(input: {
  rankValue?: number;
  rankName?: RankName;
}): { name: RankName; value: number } {
  if (input.rankValue !== undefined) {
    return { value: input.rankValue, name: rankValueToName(input.rankValue) };
  }

  const rankName = input.rankName as RankName;
  return { name: rankName, value: rankNameToValue(rankName) };
}

export class SoldierService {
  constructor(private readonly repository: SoldierRepository) {}

  async createSoldier(input: CreateSoldierBody): Promise<Soldier> {
    const now = new Date();
    const soldier: Soldier = {
      _id: input._id,
      name: input.name,
      rank: resolveRank(input),
      limitations: input.limitations.map((limitation) => limitation.toLowerCase()),
      createdAt: now,
      updatedAt: now,
    };

    try {
      return await this.repository.create(soldier);
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new SoldierDuplicateIdError(input._id);
      }
      throw err;
    }
  }

  async getSoldierById(id: string): Promise<Soldier | null> {
    return this.repository.getById(id);
  }

  async listSoldiers(query: ListSoldiersQuery): Promise<Soldier[]> {
    const filter: Filter<Soldier> = {};

    if (query.name !== undefined) {
      filter.name = query.name;
    }
    if (query.limitations && query.limitations.length > 0) {
      filter.limitations = { $all: query.limitations };
    }
    if (query.rankValue !== undefined) {
      filter['rank.value'] = query.rankValue;
    }
    if (query.rankName !== undefined) {
      filter['rank.name'] = query.rankName;
    }

    return this.repository.find(filter);
  }

  async deleteSoldier(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }

  async patchSoldier(id: string, input: PatchSoldierBody): Promise<Soldier | null> {
    const fields: Partial<Omit<Soldier, '_id'>> = { updatedAt: new Date() };

    if (input.name !== undefined) {
      fields.name = input.name;
    }
    if (input.rankValue !== undefined || input.rankName !== undefined) {
      fields.rank = resolveRank(input);
    }
    if (input.limitations !== undefined) {
      fields.limitations = input.limitations.map((limitation) => limitation.toLowerCase());
    }

    return this.repository.patch(id, fields);
  }

  async pushLimitations(id: string, limitations: string[]): Promise<Soldier | null> {
    return this.repository.pushLimitations(
      id,
      limitations.map((limitation) => limitation.toLowerCase()),
    );
  }
}