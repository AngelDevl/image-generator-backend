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
