import request from 'supertest';
import app from '../app';
import { User } from '../app/modules/User/user.model';
import { TeamMembership } from '../app/modules/Team/team.model';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import {
  addTeamMember,
  createAuthToken,
  createTestTeam,
  createTestUser,
} from './support/fixtures';

/**
 * `PATCH`/`DELETE /users/:id` — Phase 5.6.
 *
 * Accounts were previously create-and-read-only, so the admin console could only ever grow. The
 * cases that matter most here are the two guards: the platform must never be left without a super
 * admin, and nobody may delete the account they are signed in as. Both are unrecoverable in-app.
 */

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

describe('PATCH /api/v1/users/:id', () => {
  it('renames a user', async () => {
    const admin = await createTestUser({
      role: 'super_admin',
      email: 'um-admin@example.test',
    });
    const target = await createTestUser({
      email: 'um-target@example.test',
      name: 'Old Name',
    });

    const res = await request(app)
      .patch(`/api/v1/users/${target._id}`)
      .set('Authorization', `Bearer ${createAuthToken(admin)}`)
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('New Name');
  });

  it('promotes a user to super_admin', async () => {
    const admin = await createTestUser({
      role: 'super_admin',
      email: 'um-promoter@example.test',
    });
    const target = await createTestUser({ email: 'um-promotee@example.test' });

    const res = await request(app)
      .patch(`/api/v1/users/${target._id}`)
      .set('Authorization', `Bearer ${createAuthToken(admin)}`)
      .send({ role: 'super_admin' });

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('super_admin');
  });

  it('refuses to demote the last super admin', async () => {
    // Allowing this locks everyone out of administering the deployment, with no in-app way back.
    const onlyAdmin = await createTestUser({
      role: 'super_admin',
      email: 'um-only@example.test',
    });

    const res = await request(app)
      .patch(`/api/v1/users/${onlyAdmin._id}`)
      .set('Authorization', `Bearer ${createAuthToken(onlyAdmin)}`)
      .send({ role: 'user' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('last super admin');
    expect((await User.findById(onlyAdmin._id))?.role).toBe('super_admin');
  });

  it('allows demoting a super admin while another remains', async () => {
    const keeper = await createTestUser({
      role: 'super_admin',
      email: 'um-keeper@example.test',
    });
    const demotable = await createTestUser({
      role: 'super_admin',
      email: 'um-demotable@example.test',
    });

    const res = await request(app)
      .patch(`/api/v1/users/${demotable._id}`)
      .set('Authorization', `Bearer ${createAuthToken(keeper)}`)
      .send({ role: 'user' });

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('user');
  });

  it('rejects an empty body rather than reporting a change that never happened', async () => {
    const admin = await createTestUser({
      role: 'super_admin',
      email: 'um-empty@example.test',
    });
    const target = await createTestUser({
      email: 'um-empty-target@example.test',
    });

    const res = await request(app)
      .patch(`/api/v1/users/${target._id}`)
      .set('Authorization', `Bearer ${createAuthToken(admin)}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('404s for a user that does not exist', async () => {
    const admin = await createTestUser({
      role: 'super_admin',
      email: 'um-404@example.test',
    });

    const res = await request(app)
      .patch('/api/v1/users/507f1f77bcf86cd799439011')
      .set('Authorization', `Bearer ${createAuthToken(admin)}`)
      .send({ name: 'Nobody' });

    expect(res.status).toBe(404);
  });

  it('forbids a non-super-admin', async () => {
    const member = await createTestUser({ email: 'um-member@example.test' });
    const target = await createTestUser({
      email: 'um-member-target@example.test',
    });

    const res = await request(app)
      .patch(`/api/v1/users/${target._id}`)
      .set('Authorization', `Bearer ${createAuthToken(member)}`)
      .send({ name: 'Nope' });

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/users/:id', () => {
  it('deletes a user and cleans up their team memberships', async () => {
    const admin = await createTestUser({
      role: 'super_admin',
      email: 'ud-admin@example.test',
    });
    const target = await createTestUser({ email: 'ud-target@example.test' });
    const team = await createTestTeam({ createdBy: admin._id.toString() });
    await addTeamMember(team._id.toString(), target._id.toString());

    const res = await request(app)
      .delete(`/api/v1/users/${target._id}`)
      .set('Authorization', `Bearer ${createAuthToken(admin)}`);

    expect(res.status).toBe(200);
    expect(await User.findById(target._id)).toBeNull();
    // Left behind, these keep listing a deleted account as a team member.
    expect(
      await TeamMembership.countDocuments({ user_id: target._id.toString() }),
    ).toBe(0);
  });

  it('refuses to delete your own account', async () => {
    const admin = await createTestUser({
      role: 'super_admin',
      email: 'ud-self@example.test',
    });

    const res = await request(app)
      .delete(`/api/v1/users/${admin._id}`)
      .set('Authorization', `Bearer ${createAuthToken(admin)}`);

    expect(res.status).toBe(400);
    expect(await User.findById(admin._id)).not.toBeNull();
  });

  it('keeps at least one super admin alive across successive deletes', async () => {
    const onlyAdmin = await createTestUser({
      role: 'super_admin',
      email: 'ud-only@example.test',
    });
    const other = await createTestUser({
      role: 'super_admin',
      email: 'ud-other@example.test',
    });

    // Two exist, so this one is allowed.
    const first = await request(app)
      .delete(`/api/v1/users/${onlyAdmin._id}`)
      .set('Authorization', `Bearer ${createAuthToken(other)}`);
    expect(first.status).toBe(200);

    // The survivor cannot delete itself, and a plain member cannot delete anyone — so the last
    // super admin is unreachable from every direction.
    const selfDelete = await request(app)
      .delete(`/api/v1/users/${other._id}`)
      .set('Authorization', `Bearer ${createAuthToken(other)}`);
    expect(selfDelete.status).toBe(400);
    expect(await User.findById(other._id)).not.toBeNull();
  });

  it('forbids a non-super-admin', async () => {
    const member = await createTestUser({ email: 'ud-member@example.test' });
    const target = await createTestUser({
      email: 'ud-member-target@example.test',
    });

    const res = await request(app)
      .delete(`/api/v1/users/${target._id}`)
      .set('Authorization', `Bearer ${createAuthToken(member)}`);

    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/auth/me', () => {
  it('reports which teams the caller administers, so the UI can show the right navigation', async () => {
    const user = await createTestUser({ email: 'me-teamadmin@example.test' });
    const adminOf = await createTestTeam({
      name: 'Administered',
      createdBy: user._id.toString(),
    });
    const memberOf = await createTestTeam({
      name: 'Just a member',
      createdBy: user._id.toString(),
    });
    await addTeamMember(
      adminOf._id.toString(),
      user._id.toString(),
      'team_admin',
    );
    await addTeamMember(memberOf._id.toString(), user._id.toString(), 'member');

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${createAuthToken(user)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.team_ids).toHaveLength(2);
    expect(res.body.data.team_admin_team_ids).toEqual([adminOf._id.toString()]);
  });
});
