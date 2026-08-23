import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteSavedView, loadSavedViews, saveView } from './savedViews';

const USER = 'user-1';
const key = (id: string) => `growth-studio:saved-views:${id}`;

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('saved views', () => {
  it('round-trips a view', () => {
    saveView(USER, { name: 'Hot AI', category: 'AI', sort: '-opportunity_score' });

    expect(loadSavedViews(USER)).toEqual([
      expect.objectContaining({ name: 'Hot AI', category: 'AI', sort: '-opportunity_score' }),
    ]);
  });

  it('keeps each user separate, so a shared browser does not leak views between accounts', () => {
    saveView(USER, { name: 'Mine', sort: '-trend_score' });

    expect(loadSavedViews('user-2')).toEqual([]);
  });

  it('replaces a view saved under an existing name rather than duplicating it', () => {
    // Saving over a name must mean "update", or tweaking a filter leaves two entries a user can
    // only tell apart by guessing.
    saveView(USER, { name: 'Daily', sort: '-trend_score' });
    saveView(USER, { name: 'daily', sort: '-opportunity_score', category: 'AI' });

    const views = loadSavedViews(USER);
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ sort: '-opportunity_score', category: 'AI' });
  });

  it('trims the name so "Daily " and "Daily" are the same view', () => {
    saveView(USER, { name: '  Daily  ', sort: '-trend_score' });
    saveView(USER, { name: 'Daily', sort: '-opportunity_score' });

    expect(loadSavedViews(USER)).toHaveLength(1);
    expect(loadSavedViews(USER)[0].name).toBe('Daily');
  });

  it('puts the newest first', () => {
    saveView(USER, { name: 'First', sort: 'a' });
    saveView(USER, { name: 'Second', sort: 'b' });

    expect(loadSavedViews(USER).map((v) => v.name)).toEqual(['Second', 'First']);
  });

  it('caps the list so the chip row cannot grow unusable', () => {
    for (let i = 0; i < 20; i += 1) saveView(USER, { name: `View ${i}`, sort: 'a' });

    expect(loadSavedViews(USER)).toHaveLength(12);
  });

  it('deletes only the named view', () => {
    saveView(USER, { name: 'Keep', sort: 'a' });
    const withBoth = saveView(USER, { name: 'Drop', sort: 'b' });
    const dropId = withBoth.find((v) => v.name === 'Drop')!.id;

    expect(deleteSavedView(USER, dropId).map((v) => v.name)).toEqual(['Keep']);
  });

  it('reads as empty rather than throwing when the stored value is corrupt', () => {
    // Hand-edited or half-written storage must not take the feed down with it.
    localStorage.setItem(key(USER), '{not json');
    expect(loadSavedViews(USER)).toEqual([]);

    localStorage.setItem(key(USER), '{"not":"an array"}');
    expect(loadSavedViews(USER)).toEqual([]);
  });

  it('drops individual entries that do not match the expected shape', () => {
    localStorage.setItem(
      key(USER),
      JSON.stringify([{ id: 'ok', name: 'Good', sort: 'a' }, { name: 'no id' }, null, 42]),
    );

    expect(loadSavedViews(USER)).toEqual([{ id: 'ok', name: 'Good', sort: 'a' }]);
  });

  it('survives storage being unavailable entirely', () => {
    // A private window with site data blocked throws on access rather than returning null.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(loadSavedViews(USER)).toEqual([]);
  });

  it('still returns the updated list when a write fails, so the session behaves normally', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(saveView(USER, { name: 'Ephemeral', sort: 'a' })).toEqual([
      expect.objectContaining({ name: 'Ephemeral' }),
    ]);
  });
});
