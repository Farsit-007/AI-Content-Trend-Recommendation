import { FilterQuery, Query } from 'mongoose';

/**
 * Hard ceiling on `?limit=`. Without it, `?limit=100000` returns an entire collection in one
 * response — and the news feed is `optionalAuth`, so that reach includes anonymous callers.
 */
export const MAX_PAGE_LIMIT = 100;
export const DEFAULT_PAGE_LIMIT = 10;

/** Reserved query-string keys that control the builder itself and must never reach `.find()`. */
const CONTROL_KEYS = ['searchTerm', 'search', 'sort', 'limit', 'page'];

/**
 * Escapes every regex metacharacter so a search term is matched literally. Without this a term like
 * `(a+)+$` is compiled as a catastrophic-backtracking pattern and pins a database thread for as long
 * as it runs — user input reaching a regex engine unescaped is the whole ReDoS class.
 */
export const escapeRegex = (input: string): string => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface QueryBuilderOptions {
  /** Fields `?searchTerm=` may match against. */
  searchableFields?: string[];
  /**
   * Fields a caller may filter on via a bare query param. Anything not listed is dropped rather than
   * forwarded to Mongo — see `filter()` for why an allowlist and not a denylist.
   */
  filterableFields?: string[];
  /**
   * Fields a caller may sort by. Sorting an unindexed field (`?sort=embedding` — 1536-element arrays)
   * is a one-request denial of service, so this is an allowlist too.
   */
  sortableFields?: string[];
  /** Applied when the caller sends no `?sort=`, or sends one that is entirely disallowed. */
  defaultSort?: string;
}

class QueryBuilder<T> {
  public modelQuery: Query<T[], T>;
  public query: Record<string, unknown>;
  private options: QueryBuilderOptions;

  constructor(modelQuery: Query<T[], T>, query: Record<string, unknown>, options: QueryBuilderOptions = {}) {
    this.modelQuery = modelQuery;
    this.query = query;
    this.options = options;
  }

  /**
   * Case-insensitive substring match across `searchableFields`. The term is regex-escaped (see
   * `escapeRegex`) so it can only ever be matched as a literal.
   */
  search(searchFields?: string[]) {
    const fields = searchFields ?? this.options.searchableFields ?? [];
    const raw = this.query.searchTerm ?? this.query.search;
    const searchTerm = typeof raw === 'string' ? raw.trim() : '';

    if (searchTerm && fields.length > 0) {
      const safe = escapeRegex(searchTerm);
      this.modelQuery = this.modelQuery.find({
        $or: fields.map((field) => ({ [field]: { $regex: safe, $options: 'i' } }) as FilterQuery<T>),
      });
    }
    return this;
  }

  /**
   * Applies only the query params named in `filterableFields`.
   *
   * This is an allowlist, not a denylist, on purpose. The previous implementation forwarded every
   * unrecognized query param straight into `.find()`, which meant the set of filterable fields was
   * "whatever the schema happens to have" and the safety of the endpoint depended entirely on
   * Express's query parser not expanding `?field[$ne]=x` into a nested operator object. Express 5
   * defaults to the `simple` parser, which doesn't — but that is an implicit dependency on a global
   * setting nobody would think to check before changing (see the note in app.ts).
   *
   * Values are only ever accepted as strings, so a nested object can't reach Mongo even if the
   * parser is switched.
   */
  filter() {
    const allowed = this.options.filterableFields;
    if (!allowed || allowed.length === 0) return this;

    const conditions: Record<string, string> = {};
    for (const field of allowed) {
      if (CONTROL_KEYS.includes(field)) continue;
      const value = this.query[field];
      if (typeof value === 'string' && value.length > 0) {
        conditions[field] = value;
      }
    }

    if (Object.keys(conditions).length > 0) {
      this.modelQuery = this.modelQuery.find(conditions as FilterQuery<T>);
    }
    return this;
  }

  /**
   * Space-separated sort spec (`-current_trend_score created_at`), filtered to `sortableFields`.
   * A spec whose every term is disallowed falls back to `defaultSort` rather than sorting by
   * nothing, so paginated results stay stable across pages.
   */
  sort() {
    const allowed = this.options.sortableFields;
    const requested = typeof this.query.sort === 'string' ? this.query.sort : '';

    const permitted = requested
      .split(/[\s,]+/)
      .filter(Boolean)
      .filter((term) => !allowed || allowed.includes(term.replace(/^-/, '')));

    const sortSpec = permitted.length > 0 ? permitted.join(' ') : this.options.defaultSort;
    if (sortSpec) {
      this.modelQuery = this.modelQuery.sort(sortSpec);
    }
    return this;
  }

  paginate() {
    const { page, limit } = this.resolvePaging();
    this.modelQuery = this.modelQuery.skip((page - 1) * limit).limit(limit);
    return this;
  }

  async countTotal() {
    const total = await this.modelQuery.model.countDocuments(this.modelQuery.getFilter());
    const { page, limit } = this.resolvePaging();

    return {
      page,
      total,
      limit,
      totalPage: Math.ceil(total / limit),
    };
  }

  /** Single source of truth for page/limit so `paginate()` and `countTotal()` can never disagree. */
  private resolvePaging(): { page: number; limit: number } {
    const rawPage = Number(this.query.page);
    const rawLimit = Number(this.query.limit);

    const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
    const limit =
      Number.isFinite(rawLimit) && rawLimit >= 1
        ? Math.min(Math.floor(rawLimit), MAX_PAGE_LIMIT)
        : DEFAULT_PAGE_LIMIT;

    return { page, limit };
  }
}

export default QueryBuilder;
