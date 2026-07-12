/* eslint-disable @typescript-eslint/no-explicit-any */
import { FilterQuery, Query } from 'mongoose';

class QueryBuilder<T> {
  public modelQuery: Query<T[], T>;
  public query: Record<string, unknown>;

  constructor(modelQuery: Query<T[], T>, query: Record<string, unknown>) {
    this.modelQuery = modelQuery;
    this.query = query;
  }

  search(searchFields: string[]) {
    const searchTerm = this?.query?.searchTerm;
    if (searchTerm) {
      this.modelQuery = this.modelQuery.find({
        $or: searchFields.map(
          (field) =>
            ({
              [field]: { $regex: searchTerm, $options: 'i' },
            }) as FilterQuery<T>,
        ),
      });
    }
    return this;
  }

  filter() {
    const queryObj = { ...this.query };
    const excludeFields = [
      'searchTerm',
      'sort',
      'limit',
      'page',
      'minPrice',
      'maxPrice',
    ];

    excludeFields.forEach((el) => delete queryObj[el]);
    const filterConditions: Record<string, any> = { ...queryObj };
    // Add price range filter if present
    if (this.query.minPrice || this.query.maxPrice) {
      filterConditions.amount = {};
      if (this.query.minPrice) {
        filterConditions.amount.$gte = Number(this.query.minPrice);
      }
      if (this.query.maxPrice) {
        filterConditions.amount.$lte = Number(this.query.maxPrice);
      }
    }


    this.modelQuery = this.modelQuery.find(filterConditions as FilterQuery<T>);
    return this;
  }

  sort() {
    const sort = this.query.sort || '-createdAt';
    this.modelQuery = this.modelQuery.sort(sort as string);
    return this;
  }
  paginate() {
    const page = Number(this.query.page) || 1;
    const limit = Number(this.query.limit) || 10;
    const skip = (page - 1) * limit;

    this.modelQuery = this.modelQuery.skip(skip).limit(limit);
    return this;
  }

  async countTotal() {
    const totalQueries = this.modelQuery.getFilter();
    const total = await this.modelQuery.model.countDocuments(totalQueries);
    const page = Number(this?.query?.page) || 1;
    const limit = Number(this.query?.limit) || 10;
    const totalPage = Math.ceil(total / limit);

    return {
      page,
      total,
      limit,
      totalPage,
    };
  }
}

export default QueryBuilder;
