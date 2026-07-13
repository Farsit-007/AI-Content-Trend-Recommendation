import AppError from '../../errors/AppError';
import { decrypt, encrypt } from '../../lib/crypto';
import { Platform } from '../../lib/platforms';
import { httpStatus } from '../../utils/httpStatus';
import { PlatformCredential } from './platformCredential.model';

const upsertCredential = async (
  teamId: string,
  payload: { platform: Platform; token: string; account_id?: string },
  addedBy: string,
) => {
  const encrypted_token = encrypt(payload.token);
  const token_last4 = payload.token.slice(-4);

  return PlatformCredential.findOneAndUpdate(
    { team_id: teamId, platform: payload.platform },
    {
      team_id: teamId,
      platform: payload.platform,
      encrypted_token,
      token_last4,
      account_id: payload.account_id,
      added_by: addedBy,
      updated_at: new Date(),
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
};

const listCredentials = async (teamId: string) => {
  // `encrypted_token` is `select: false` on the schema, so this naturally returns only metadata.
  return PlatformCredential.find({ team_id: teamId });
};

const revealCredential = async (teamId: string, platform: Platform) => {
  const credential = await PlatformCredential.findOne({ team_id: teamId, platform }).select('+encrypted_token');
  if (!credential) {
    throw new AppError(httpStatus.NOT_FOUND, `No ${platform} credential is stored for this team`);
  }

  return {
    platform: credential.platform,
    account_id: credential.account_id,
    token: decrypt(credential.encrypted_token),
  };
};

const deleteCredential = async (teamId: string, platform: Platform) => {
  const result = await PlatformCredential.findOneAndDelete({ team_id: teamId, platform });
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, `No ${platform} credential is stored for this team`);
  }
  return result;
};

export const PlatformCredentialService = {
  upsertCredential,
  listCredentials,
  revealCredential,
  deleteCredential,
};
