import QueryBuilder, { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, escapeRegex } from '../app/builder/QueryBuilder';

/**
 * `QueryBuilder` is the single class every list endpoint's query string flows through, so its
 * hardening is worth asserting directly rather than only through the route integration tests.
 *
 * The mongoose `Query` is stubbed: every chainable method records its arguments and returns itself,
 * which is all the builder actually needs and keeps this a pure unit test with no database.
 */
interface StubQuery {
  find: jest.Mock;
  sort: jest.Mock;
  skip: jest.Mock;
  limit: jest.Mock;
  model: { countDocuments: jest.Mock };
  getFilter: jest.Mock;
}

const stubQuery = (): StubQuery => {
  const q: Partial<StubQuery> = {
    model: { countDocuments: jest.fn().mockResolvedValue(0) },
    getFilter: jest.fn().mockReturnValue({}),
  };
  for (const method of ['find', 'sort', 'skip', 'limit'] as const) {
    q[method] = jest.fn().mockReturnValue(q);
  }
  return q as StubQuery;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const build = (query: Record<string, unknown>, options?: any) => {
  const q = stubQuery();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder = new QueryBuilder(q as any, query, options);
  return { q, builder };
};

describe('escapeRegex', () => {
  it('neutralizes every regex metacharacter', () => {
    expect(escapeRegex('a+b')).toBe('a\\+b');
    expect(escapeRegex('(a+)+$')).toBe('\\(a\\+\\)\\+\\$');
    expect(escapeRegex('c.*')).toBe('c\\.\\*');
    expect(escapeRegex('[a-z]{2,}')).toBe('\\[a-z\\]\\{2,\\}');
  });

  it('leaves an ordinary search term untouched', () => {
    expect(escapeRegex('react 19 release')).toBe('react 19 release');
  });
});

describe('QueryBuilder.search', () => {
  it('passes the search term to Mongo escaped, so it can only match literally', () => {
    // The ReDoS case: unescaped, this compiles to a catastrophic-backtracking pattern.
    const { q, builder } = build({ searchTerm: '(a+)+$' }, { searchableFields: ['title', 'snippet'] });
    builder.search();

    const filter = q.find.mock.calls[0][0];
    expect(filter.$or).toEqual([
      { title: { $regex: '\\(a\\+\\)\\+\\$', $options: 'i' } },
      { snippet: { $regex: '\\(a\\+\\)\\+\\$', $options: 'i' } },
    ]);
  });

  it('accepts `search` as an alias for `searchTerm`', () => {
    const { q, builder } = build({ search: 'react' }, { searchableFields: ['title'] });
    builder.search();
    expect(q.find.mock.calls[0][0].$or).toEqual([{ title: { $regex: 'react', $options: 'i' } }]);
  });

  it('does nothing when the term is absent, blank, or there are no searchable fields', () => {
    for (const query of [{}, { searchTerm: '   ' }]) {
      const { q, builder } = build(query, { searchableFields: ['title'] });
      builder.search();
      expect(q.find).not.toHaveBeenCalled();
    }

    const { q, builder } = build({ searchTerm: 'react' }, { searchableFields: [] });
    builder.search();
    expect(q.find).not.toHaveBeenCalled();
  });
});

describe('QueryBuilder.filter', () => {
  it('applies only allowlisted fields and drops everything else', () => {
    const { q, builder } = build(
      { category: 'AI', source: 'hackernews', embedding: 'leak', password_hash: 'leak' },
      { filterableFields: ['category', 'source'] },
    );
    builder.filter();

    expect(q.find).toHaveBeenCalledWith({ category: 'AI', source: 'hackernews' });
  });

  it('ignores non-string values, so a parsed operator object can never reach Mongo', () => {
    // What `?category[$ne]=x` becomes if the query parser is ever switched to `extended`.
    const { q, builder } = build({ category: { $ne: 'AI' } }, { filterableFields: ['category'] });
    builder.filter();

    expect(q.find).not.toHaveBeenCalled();
  });

  it('is a no-op when no allowlist is configured, rather than forwarding everything', () => {
    const { q, builder } = build({ category: 'AI' }, {});
    builder.filter();
    expect(q.find).not.toHaveBeenCalled();
  });
});

describe('QueryBuilder.sort', () => {
  it('keeps allowlisted terms, including descending ones', () => {
    const { q, builder } = build(
      { sort: '-current_trend_score created_at' },
      { sortableFields: ['current_trend_score', 'created_at'] },
    );
    builder.sort();
    expect(q.sort).toHaveBeenCalledWith('-current_trend_score created_at');
  });

  it('strips a disallowed term but honours the rest', () => {
    const { q, builder } = build(
      { sort: 'embedding -created_at' },
      { sortableFields: ['created_at'], defaultSort: '-created_at' },
    );
    builder.sort();
    expect(q.sort).toHaveBeenCalledWith('-created_at');
  });

  it('falls back to the default when every requested term is disallowed', () => {
    // `?sort=embedding` asks Mongo to sort 1536-element arrays with no index.
    const { q, builder } = build({ sort: 'embedding' }, { sortableFields: ['created_at'], defaultSort: '-created_at' });
    builder.sort();
    expect(q.sort).toHaveBeenCalledWith('-created_at');
  });

  it('applies the default when no sort is requested, and nothing when there is no default', () => {
    const withDefault = build({}, { sortableFields: ['created_at'], defaultSort: '-created_at' });
    withDefault.builder.sort();
    expect(withDefault.q.sort).toHaveBeenCalledWith('-created_at');

    const withoutDefault = build({}, { sortableFields: ['created_at'] });
    withoutDefault.builder.sort();
    expect(withoutDefault.q.sort).not.toHaveBeenCalled();
  });
});

describe('QueryBuilder.paginate', () => {
  it('clamps an oversized limit to the ceiling', () => {
    const { q, builder } = build({ limit: '100000' });
    builder.paginate();
    expect(q.limit).toHaveBeenCalledWith(MAX_PAGE_LIMIT);
  });

  it('falls back to the default limit for missing, zero, negative, and non-numeric values', () => {
    for (const limit of [undefined, '0', '-5', 'abc', '']) {
      const { q, builder } = build(limit === undefined ? {} : { limit });
      builder.paginate();
      expect(q.limit).toHaveBeenCalledWith(DEFAULT_PAGE_LIMIT);
    }
  });

  it('computes skip from the clamped limit', () => {
    const { q, builder } = build({ page: '3', limit: '20' });
    builder.paginate();
    expect(q.skip).toHaveBeenCalledWith(40);
    expect(q.limit).toHaveBeenCalledWith(20);
  });

  it('treats a page below 1 or non-numeric as page 1', () => {
    for (const page of ['0', '-2', 'abc']) {
      const { q, builder } = build({ page });
      builder.paginate();
      expect(q.skip).toHaveBeenCalledWith(0);
    }
  });

  it('reports the same clamped limit in countTotal as it applied in paginate', async () => {
    const { q, builder } = build({ limit: '100000' });
    builder.paginate();
    const meta = await builder.countTotal();

    // The two used to read `query.limit` independently, so an oversized limit made `totalPage`
    // disagree with the page size actually served.
    expect(meta.limit).toBe(MAX_PAGE_LIMIT);
    expect(q.limit).toHaveBeenCalledWith(meta.limit);
  });
});
