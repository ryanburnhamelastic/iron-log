import type { Handler, HandlerEvent } from '@netlify/functions';
import { getDb, initDb, headers } from './db';
import { authenticateRequest } from './auth';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    await initDb();
    const sql = getDb();

    // Verify Clerk JWT and get user ID
    const authResult = await authenticateRequest(event);

    if (!authResult.authenticated || !authResult.clerkUserId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: authResult.error || 'Unauthorized' }),
      };
    }

    const clerkUserId = authResult.clerkUserId;

    // Get user
    const users = await sql`SELECT id FROM users WHERE clerk_user_id = ${clerkUserId}`;
    if (users.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }
    const userId = users[0].id;

    const pathParts = event.path.split('/').filter(Boolean);
    const userProgramId = pathParts.length > 1 ? pathParts[pathParts.length - 1] : null;

    // GET - List user programs
    if (event.httpMethod === 'GET') {
      if (userProgramId && userProgramId !== 'user-programs') {
        const [userProgram] = await sql`
          SELECT up.*, p.name as program_name, p.frequency_per_week
          FROM user_programs up
          JOIN programs p ON up.program_id = p.id
          WHERE up.id = ${userProgramId} AND up.user_id = ${userId}
        `;

        if (!userProgram) {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ error: 'User program not found' }),
          };
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(userProgram),
        };
      }

      const userPrograms = await sql`
        SELECT up.*, p.name as program_name, p.frequency_per_week
        FROM user_programs up
        JOIN programs p ON up.program_id = p.id
        WHERE up.user_id = ${userId}
        ORDER BY up.is_active DESC, up.started_at DESC
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(userPrograms),
      };
    }

    // POST - Start a program
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { program_id } = body;

      if (!program_id) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'program_id is required' }),
        };
      }

      // Deactivate any currently active programs
      await sql`
        UPDATE user_programs
        SET is_active = false
        WHERE user_id = ${userId} AND is_active = true
      `;

      // Get first block and week
      const [firstBlock] = await sql`
        SELECT id FROM program_blocks
        WHERE program_id = ${program_id}
        ORDER BY sort_order
        LIMIT 1
      `;

      let firstWeekId = null;
      if (firstBlock) {
        const [firstWeek] = await sql`
          SELECT id FROM block_weeks
          WHERE block_id = ${firstBlock.id}
          ORDER BY sort_order
          LIMIT 1
        `;
        firstWeekId = firstWeek?.id || null;
      }

      const [userProgram] = await sql`
        INSERT INTO user_programs (user_id, program_id, is_active, current_block_id, current_week_id)
        VALUES (${userId}, ${program_id}, true, ${firstBlock?.id || null}, ${firstWeekId})
        RETURNING *
      `;

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(userProgram),
      };
    }

    // PUT - Update progress
    if (event.httpMethod === 'PUT' && userProgramId && userProgramId !== 'user-programs') {
      const body = JSON.parse(event.body || '{}');
      const { is_active, current_block_id, current_week_id, completed_at } = body;

      const [userProgram] = await sql`
        UPDATE user_programs
        SET
          is_active = COALESCE(${is_active}, is_active),
          current_block_id = COALESCE(${current_block_id}, current_block_id),
          current_week_id = COALESCE(${current_week_id}, current_week_id),
          completed_at = COALESCE(${completed_at}, completed_at)
        WHERE id = ${userProgramId} AND user_id = ${userId}
        RETURNING *
      `;

      if (!userProgram) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'User program not found' }),
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(userProgram),
      };
    }

    // DELETE - End program
    if (event.httpMethod === 'DELETE' && userProgramId && userProgramId !== 'user-programs') {
      await sql`
        UPDATE user_programs
        SET is_active = false, completed_at = NOW()
        WHERE id = ${userProgramId} AND user_id = ${userId}
      `;
      return { statusCode: 204, headers, body: '' };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('User programs API error:', errorMessage, error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', details: errorMessage }),
    };
  }
};

export { handler };
