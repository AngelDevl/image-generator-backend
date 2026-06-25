import {
  Collection,
  Db,
  Document,
  Filter,
  FindOptions,
  OptionalUnlessRequiredId,
  UpdateFilter,
  WithId,
} from "mongodb";

export abstract class BaseRepository<
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
    return { ...item, _id: result.insertedId } as WithId<TSchema>;
  }

  async getById(id: NonNullable<TSchema["_id"]>): Promise<WithId<TSchema> | null> {
    return this.collection.findOne({ _id: id } as Filter<TSchema>);
  }

  async find(filter: Filter<TSchema> = {}, options?: FindOptions): Promise<WithId<TSchema>[]> {
    return this.collection.find(filter, options).toArray();
  }

  async findOne(filter: Filter<TSchema>): Promise<WithId<TSchema> | null> {
    return this.collection.findOne(filter);
  }

  async update(id: NonNullable<TSchema["_id"]>, item: Partial<TSchema>): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: id } as Filter<TSchema>,
      { $set: item } as UpdateFilter<TSchema>,
    );
    return result.modifiedCount > 0;
  }

  async delete(id: NonNullable<TSchema["_id"]>): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: id } as Filter<TSchema>);
    return result.deletedCount > 0;
  }
}
