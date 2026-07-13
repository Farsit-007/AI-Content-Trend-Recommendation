import AppError from '../../errors/AppError';
import { Platform } from '../../lib/platforms';
import { httpStatus } from '../../utils/httpStatus';
import { IRequestUser } from '../User/user.interface';
import { PlatformCatalog, TeamPlatform } from './platformCatalog.model';

const createPlatform = async (
  payload: { name: Platform; label?: string; is_enabled?: boolean },
  createdBy: string,
) => {
  const existing = await PlatformCatalog.findOne({ name: payload.name.toLowerCase() });
  if (existing) {
    throw new AppError(httpStatus.CONFLICT, `Platform "${payload.name}" already exists in the catalog`);
  }

  return PlatformCatalog.create({
    name: payload.name,
    label: payload.label,
    is_enabled: payload.is_enabled ?? true,
    created_by: createdBy,
  });
};

/** super_admin sees every entry (incl. disabled, for management); everyone else sees only what's available to enable. */
const listPlatforms = async (requestingUser: IRequestUser) => {
  if (requestingUser.role === 'super_admin') {
    return PlatformCatalog.find();
  }
  return PlatformCatalog.find({ is_enabled: true });
};

const setPlatformEnabled = async (name: Platform, is_enabled: boolean) => {
  const platform = await PlatformCatalog.findOneAndUpdate(
    { name: name.toLowerCase() },
    { is_enabled, updated_at: new Date() },
    { new: true },
  );
  if (!platform) {
    throw new AppError(httpStatus.NOT_FOUND, `Platform "${name}" is not in the catalog`);
  }
  return platform;
};

const deletePlatform = async (name: Platform) => {
  const platform = await PlatformCatalog.findOneAndDelete({ name: name.toLowerCase() });
  if (!platform) {
    throw new AppError(httpStatus.NOT_FOUND, `Platform "${name}" is not in the catalog`);
  }
  await TeamPlatform.deleteMany({ platform: name.toLowerCase() });
  return platform;
};

/** For every globally-enabled catalog platform, reports whether this team has it turned on. */
const listTeamPlatforms = async (teamId: string) => {
  const [catalog, teamRows] = await Promise.all([
    PlatformCatalog.find({ is_enabled: true }),
    TeamPlatform.find({ team_id: teamId }),
  ]);

  const teamRowByPlatform = new Map(teamRows.map((row) => [row.platform, row]));

  return catalog.map((entry) => ({
    name: entry.name,
    label: entry.label,
    team_enabled: teamRowByPlatform.get(entry.name)?.is_enabled ?? false,
  }));
};

const enableForTeam = async (teamId: string, platform: Platform, enabledBy: string) => {
  const catalogEntry = await PlatformCatalog.findOne({ name: platform.toLowerCase() });
  if (!catalogEntry || !catalogEntry.is_enabled) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `"${platform}" is not currently available — ask a super_admin to add or enable it first`,
    );
  }

  return TeamPlatform.findOneAndUpdate(
    { team_id: teamId, platform: platform.toLowerCase() },
    { team_id: teamId, platform: platform.toLowerCase(), is_enabled: true, enabled_by: enabledBy, updated_at: new Date() },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
};

/** A team can always turn its own switch off, regardless of the platform's current global state. */
const disableForTeam = async (teamId: string, platform: Platform) => {
  const row = await TeamPlatform.findOneAndUpdate(
    { team_id: teamId, platform: platform.toLowerCase() },
    { is_enabled: false, updated_at: new Date() },
    { new: true },
  );
  if (!row) {
    throw new AppError(httpStatus.NOT_FOUND, `Team has not enabled "${platform}"`);
  }
  return row;
};

/** Non-throwing check — used by `getPlatformToken()` so a disabled platform silently fails over instead of erroring deep in a low-level accessor. */
const isTeamPlatformEnabled = async (teamId: string, platform: Platform): Promise<boolean> => {
  const [catalogEntry, teamRow] = await Promise.all([
    PlatformCatalog.findOne({ name: platform.toLowerCase() }),
    TeamPlatform.findOne({ team_id: teamId, platform: platform.toLowerCase() }),
  ]);
  return Boolean(catalogEntry?.is_enabled && teamRow?.is_enabled);
};

/** Throwing variant — used before writing a credential, where a clear 400 is more useful than a silent no-op. */
const assertTeamPlatformEnabled = async (teamId: string, platform: Platform): Promise<void> => {
  if (!(await isTeamPlatformEnabled(teamId, platform))) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Your team hasn't enabled "${platform}" yet — enable it first via /teams/${teamId}/platforms/${platform}/enable`,
    );
  }
};

export const PlatformCatalogService = {
  createPlatform,
  listPlatforms,
  setPlatformEnabled,
  deletePlatform,
  listTeamPlatforms,
  enableForTeam,
  disableForTeam,
  isTeamPlatformEnabled,
  assertTeamPlatformEnabled,
};
