import dns from 'dns';
import mongoose from 'mongoose';
import config from '../app/config';

dns.setServers(['8.8.8.8', '1.1.1.1']);

import { NewsItem } from '../app/modules/NewsItem/newsItem.model';
import { Team } from '../app/modules/Team/team.model';
import { IRequestUser } from '../app/modules/User/user.interface';
import { ChatMessage } from '../app/modules/Chat/chat.model';
import { ChatService } from '../app/modules/Chat/chat.service';

let failures = 0;
const check = (name: string, condition: boolean) => {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${name}`);
  } else {
    console.log(`PASS: ${name}`);
  }
};

async function main() {
  await mongoose.connect(config.database_url as string);

  const team = await Team.findOne({});
  if (!team) {
    console.error('No Team documents found — seed a team before running this live check.');
    process.exit(1);
  }
  const teamId = (team._id as mongoose.Types.ObjectId).toString();
  console.log(`Using team: ${teamId} (${(team as unknown as { name?: string }).name ?? 'unnamed'})`);

  const requestingUser: IRequestUser = { id: 'live-verify-user', email: 'live-verify@example.com', role: 'user', team_ids: [teamId] };

  const newsCount = await NewsItem.countDocuments({});
  console.log(`NewsItem docs: ${newsCount}`);

  // 1. Trend-shaped question
  const trendResult = await ChatService.askChat(
    { team_id: teamId, message: 'এই সপ্তাহে কোন news trending আছে?' },
    requestingUser,
  );
  check('trend question returns a non-empty reply', trendResult.reply.trim().length > 0);
  console.log(`  reply: ${trendResult.reply.slice(0, 200)}...`);

  // 2. Follow-up in the same conversation
  const followUp = await ChatService.askChat(
    { team_id: teamId, message: 'সেই বিষয়ে আর একটু বলো', conversation_id: trendResult.conversation_id },
    requestingUser,
  );
  check('follow-up reuses the same conversation_id', followUp.conversation_id === trendResult.conversation_id);
  const threadMessages = await ChatMessage.find({ team_id: teamId, conversation_id: trendResult.conversation_id }).sort({
    created_at: 1,
  });
  check('conversation thread persisted 4 turns (2 user + 2 assistant)', threadMessages.length === 4);

  // 3. Ambiguous question (no news keywords) still gets a grounded, non-empty reply
  const ambiguousResult = await ChatService.askChat({ team_id: teamId, message: 'আজকে কী করবো?' }, requestingUser);
  check('ambiguous question returns a non-empty reply', ambiguousResult.reply.trim().length > 0);

  // 4. Cross-team conversation_id isolation — reuse team A's conversation_id under a different team
  const otherTeam = await Team.findOne({ _id: { $ne: team._id } });
  if (otherTeam) {
    const otherTeamId = (otherTeam._id as mongoose.Types.ObjectId).toString();
    const otherUser: IRequestUser = { id: 'live-verify-user-2', email: 'live-verify-2@example.com', role: 'user', team_ids: [otherTeamId] };
    await ChatService.askChat(
      { team_id: otherTeamId, message: 'hello from another team', conversation_id: trendResult.conversation_id },
      otherUser,
    );
    const teamAHistory = await ChatMessage.find({ team_id: teamId, conversation_id: trendResult.conversation_id });
    const teamBHistory = await ChatMessage.find({ team_id: otherTeamId, conversation_id: trendResult.conversation_id });
    check('reusing another team\'s conversation_id does not merge histories', teamAHistory.length === 4 && teamBHistory.length === 2);
  } else {
    console.log('Only one Team document exists — skipping cross-team isolation check.');
  }

  await mongoose.disconnect();
  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll live chat checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
